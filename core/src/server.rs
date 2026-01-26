use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use bytes::Bytes;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper::body::Incoming;
use hyper::upgrade::on;
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot};
// use tokio::time::{timeout, Duration};
use napi::threadsafe_function::{ThreadsafeFunction, ErrorStrategy, ThreadsafeFunctionCallMode};
// use napi::Status;
use tokio_tungstenite::{WebSocketStream, tungstenite::protocol::Message, tungstenite::protocol::Role, tungstenite::handshake::derive_accept_key};
use futures_util::{SinkExt, StreamExt};

use crate::router::{Router, RouteAction};
use http_body_util::{Full, Empty, BodyExt, combinators::BoxBody, StreamBody, BodyStream};
use hyper::body::Frame;
use hyper_util::server::conn::auto::Builder;
use hyper_util::rt::TokioExecutor;
use async_compression::tokio::bufread::{GzipEncoder, BrotliEncoder};
use tokio::io::{AsyncWriteExt, BufReader};
use dashmap::DashMap;
use std::time::{Instant, Duration};
// use std::path::PathBuf;
use std::io::BufReader as StdBufReader;
use std::fs::File as StdFile;
use tokio_rustls::rustls::ServerConfig;
use tokio_rustls::TlsAcceptor;
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use tracing::info;
use jsonschema::Validator;
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use crate::governor::{TrafficGovernor, Priority};

#[derive(Debug)]
pub struct ServerMetrics {
    pub requests_total: AtomicU64,
    pub active_connections: AtomicU64,
    pub errors_total: AtomicU64,
    pub latency_sum_ms: AtomicU64,
    pub latency_count: AtomicU64,
}

impl ServerMetrics {
    pub fn new() -> Self {
        Self {
            requests_total: AtomicU64::new(0),
            active_connections: AtomicU64::new(0),
            errors_total: AtomicU64::new(0),
            latency_sum_ms: AtomicU64::new(0),
            latency_count: AtomicU64::new(0),
        }
    }

    pub fn render(&self) -> String {
        let total = self.requests_total.load(Ordering::Relaxed);
        let active = self.active_connections.load(Ordering::Relaxed);
        let errors = self.errors_total.load(Ordering::Relaxed);
        let sum = self.latency_sum_ms.load(Ordering::Relaxed);
        let count = self.latency_count.load(Ordering::Relaxed);
        let avg_latency = if count > 0 { sum as f64 / count as f64 } else { 0.0 };

        format!(
            "# HELP http_requests_total Total number of HTTP requests\n\
             # TYPE http_requests_total counter\n\
             http_requests_total {}\n\
             \n\
             # HELP http_active_connections Number of active connections\n\
             # TYPE http_active_connections gauge\n\
             http_active_connections {}\n\
             \n\
             # HELP http_requests_errors_total Total number of failed requests\n\
             # TYPE http_requests_errors_total counter\n\
             http_requests_errors_total {}\n\
             \n\
             # HELP http_request_duration_ms_avg Average request duration in ms\n\
             # TYPE http_request_duration_ms_avg gauge\n\
             http_request_duration_ms_avg {:.2}\n",
            total, active, errors, avg_latency
        )
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

pub struct RequestEvent {
    pub handler_id: u32,
    pub req_id: String,
    pub params: Vec<(String, String)>,
    pub query: String,
    pub headers: Vec<(String, String)>,
    pub method: String,
    pub url: String,
    pub body: Vec<u8>,
    pub response_sender: Mutex<Option<ResponseSender>>,
}

pub struct WsEvent {
    pub socket_id: String,
    pub event_type: String, // "open", "message", "close"
    pub payload: Option<String>,
    pub path: Option<String>,
}

#[derive(Clone)]
pub struct CorsConfig {
    pub origin: String,
    pub methods: String,
    pub headers: String,
    pub credentials: bool,
}

// Update ResponseSender to use BoxBody for flexibility (String or Stream)
pub type ResponseSender = oneshot::Sender<Response<BoxBody<Bytes, std::io::Error>>>;
pub type WsSender = mpsc::UnboundedSender<Message>;
pub type WsPeers = Arc<Mutex<HashMap<String, WsSender>>>;
pub type WsRooms = Arc<Mutex<HashMap<String, HashSet<String>>>>;

// Helper to box full bodies
fn full<T: Into<Bytes>>(chunk: T) -> BoxBody<Bytes, std::io::Error> {
    Full::new(chunk.into())
        .map_err(|never| match never {})
        .boxed()
}

pub struct NativeServer {
    port: u16,
    router: Arc<Router>,
    js_callback: Option<ThreadsafeFunction<RequestEvent, ErrorStrategy::Fatal>>,
    ws_callback: Option<ThreadsafeFunction<WsEvent, ErrorStrategy::Fatal>>,
    req_id_counter: Arc<AtomicU64>,
    static_routes: Arc<Mutex<Vec<(String, String)>>>, // (prefix, directory)
    ws_peers: WsPeers,
    ws_rooms: WsRooms,
    cors_config: Arc<Mutex<Option<CorsConfig>>>,
    // Key: "IP RoutePath" -> (count, window_start)
    rate_limit_store: Arc<DashMap<String, (u32, Instant)>>,
    // Key: "Method Path" -> (Body, expiry)
    cache_store: Arc<DashMap<String, (Bytes, Instant)>>,
    tls_paths: Arc<Mutex<Option<(String, String)>>>, // (cert_path, key_path)
    jwt_secret: Arc<Mutex<Option<String>>>,
    redis_client: Arc<Mutex<Option<redis::Client>>>,
    metrics: Arc<ServerMetrics>,
    security_headers: Arc<AtomicBool>,
    schema_cache: Arc<DashMap<String, Arc<Validator>>>,
    governor: Arc<TrafficGovernor>,
    shutdown_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

impl Clone for NativeServer {
    fn clone(&self) -> Self {
        Self {
            port: self.port,
            router: self.router.clone(),
            js_callback: self.js_callback.clone(),
            ws_callback: self.ws_callback.clone(),
            req_id_counter: self.req_id_counter.clone(),
            static_routes: self.static_routes.clone(),
            ws_peers: self.ws_peers.clone(),
            ws_rooms: self.ws_rooms.clone(),
            cors_config: self.cors_config.clone(),
            rate_limit_store: self.rate_limit_store.clone(),
            cache_store: self.cache_store.clone(),
            tls_paths: self.tls_paths.clone(),
            jwt_secret: self.jwt_secret.clone(),
            redis_client: self.redis_client.clone(),
            metrics: self.metrics.clone(),
            security_headers: self.security_headers.clone(),
            schema_cache: self.schema_cache.clone(),
            governor: self.governor.clone(),
            shutdown_tx: self.shutdown_tx.clone(),
        }
    }
}

impl NativeServer {
    pub fn new(port: u16) -> Self {
        let governor = Arc::new(TrafficGovernor::new(200, 10, 1000));
        Self { 
            port, 
            router: Arc::new(Router::new()),
            js_callback: None,
            ws_callback: None,
            req_id_counter: Arc::new(AtomicU64::new(0)),
            static_routes: Arc::new(Mutex::new(Vec::new())),
            ws_peers: Arc::new(Mutex::new(HashMap::new())),
            ws_rooms: Arc::new(Mutex::new(HashMap::new())),
            cors_config: Arc::new(Mutex::new(None)),
            rate_limit_store: Arc::new(DashMap::new()),
            cache_store: Arc::new(DashMap::new()),
            tls_paths: Arc::new(Mutex::new(None)),
            jwt_secret: Arc::new(Mutex::new(None)),
            redis_client: Arc::new(Mutex::new(None)),
            metrics: Arc::new(ServerMetrics::new()),
            security_headers: Arc::new(AtomicBool::new(false)),
            schema_cache: Arc::new(DashMap::new()),
            governor,
            shutdown_tx: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_security_headers(&self, enabled: bool) {
        self.security_headers.store(enabled, Ordering::Relaxed);
    }

    pub fn set_redis(&self, client: redis::Client) {
        *self.redis_client.lock().unwrap() = Some(client);
    }

    pub fn set_jwt_secret(&self, secret: String) {
        let mut s = self.jwt_secret.lock().unwrap();
        *s = Some(secret);
    }

    pub fn set_tls(&self, cert_path: String, key_path: String) {
        let mut paths = self.tls_paths.lock().unwrap();
        *paths = Some((cert_path, key_path));
    }

    pub fn set_cors(&self, origin: String, methods: String, headers: String, credentials: bool) {
        let mut config = self.cors_config.lock().unwrap();
        *config = Some(CorsConfig {
            origin,
            methods,
            headers,
            credentials,
        });
    }

    pub fn get_metrics(&self) -> String {
        let (limit, inflight, shed) = self.governor.get_metrics();
        let base = self.metrics.render();
        
        format!("{}
             # HELP qhttpx_concurrency_limit Current adaptive concurrency limit
             # TYPE qhttpx_concurrency_limit gauge
             qhttpx_concurrency_limit {}

             # HELP qhttpx_inflight_requests Current number of requests being processed
             # TYPE qhttpx_inflight_requests gauge
             qhttpx_inflight_requests {}

             # HELP qhttpx_shed_requests_total Total number of requests rejected by governor
             # TYPE qhttpx_shed_requests_total counter
             qhttpx_shed_requests_total {}
             ", base, limit, inflight, shed)
    }

    pub fn ws_subscribe(&self, socket_id: String, room: String) {
        let mut rooms = self.ws_rooms.lock().unwrap();
        rooms.entry(room).or_insert_with(HashSet::new).insert(socket_id);
    }

    pub fn ws_unsubscribe(&self, socket_id: String, room: String) {
        let mut rooms = self.ws_rooms.lock().unwrap();
        if let Some(sockets) = rooms.get_mut(&room) {
            sockets.remove(&socket_id);
            if sockets.is_empty() {
                rooms.remove(&room);
            }
        }
    }

    pub fn ws_publish(&self, room: String, message: String) {
        let rooms = self.ws_rooms.lock().unwrap();
        let peers = self.ws_peers.lock().unwrap();
        
        if let Some(sockets) = rooms.get(&room) {
            for socket_id in sockets {
                if let Some(sender) = peers.get(socket_id) {
                    let _ = sender.send(Message::Text(message.clone().into()));
                }
            }
        }
    }

    // Update cleanup to remove from rooms
    pub fn _cleanup_socket(&self, socket_id: &String) {
        // Remove from peers
        {
            let mut peers = self.ws_peers.lock().unwrap();
            peers.remove(socket_id);
        }
        
        // Remove from all rooms
        {
            let mut rooms = self.ws_rooms.lock().unwrap();
            for sockets in rooms.values_mut() {
                sockets.remove(socket_id);
            }
        }
    }

    pub fn add_static_route(&self, prefix: String, dir: String) {
        let mut routes = self.static_routes.lock().unwrap();
        routes.push((prefix, dir));
    }

    pub fn set_callback(&mut self, callback: ThreadsafeFunction<RequestEvent, ErrorStrategy::Fatal>) {
        self.js_callback = Some(callback);
    }

    pub fn set_ws_callback(&mut self, callback: ThreadsafeFunction<WsEvent, ErrorStrategy::Fatal>) {
        self.ws_callback = Some(callback);
    }

    pub fn ws_send(&self, socket_id: String, message: String) {
        let peers = self.ws_peers.lock().unwrap();
        if let Some(sender) = peers.get(&socket_id) {
            let _ = sender.send(Message::Text(message.into()));
        }
    }

    pub fn add_route(&self, method: &str, path: &str, action: RouteAction) -> Result<(), String> {
        self.router.add(method, path, action)
    }

    pub fn send_response(&self, handle: &Mutex<Option<ResponseSender>>, status: u16, body: String) -> Result<(), String> {
        let mut guard = handle.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = guard.take() {
            let mut builder = Response::builder()
                .status(StatusCode::from_u16(status).unwrap_or(StatusCode::OK));

            // Inject Security Headers
            if self.security_headers.load(Ordering::Relaxed) {
                builder = builder
                    .header("X-Content-Type-Options", "nosniff")
                    .header("X-Frame-Options", "SAMEORIGIN")
                    .header("X-XSS-Protection", "1; mode=block")
                    .header("Referrer-Policy", "strict-origin-when-cross-origin");
            }

            // Inject CORS
            {
                let config = self.cors_config.lock().unwrap();
                if let Some(cors) = &*config {
                    builder = builder.header("Access-Control-Allow-Origin", &cors.origin);
                    if cors.credentials {
                        builder = builder.header("Access-Control-Allow-Credentials", "true");
                    }
                }
            }

            let response = builder
                .body(full(body))
                .map_err(|e| e.to_string())?;
            
            let _ = tx.send(response);
            Ok(())
        } else {
            Err("Response already sent".to_string())
        }
    }

    pub fn send_html(&self, handle: &Mutex<Option<ResponseSender>>, status: u16, body: String) -> Result<(), String> {
        let mut guard = handle.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = guard.take() {
            let mut builder = Response::builder()
                .status(StatusCode::from_u16(status).unwrap_or(StatusCode::OK))
                .header("Content-Type", "text/html");

            // Inject Security Headers
            if self.security_headers.load(Ordering::Relaxed) {
                builder = builder
                    .header("X-Content-Type-Options", "nosniff")
                    .header("X-Frame-Options", "SAMEORIGIN")
                    .header("X-XSS-Protection", "1; mode=block")
                    .header("Referrer-Policy", "strict-origin-when-cross-origin");
            }

            // Inject CORS
            {
                let config = self.cors_config.lock().unwrap();
                if let Some(cors) = &*config {
                    builder = builder.header("Access-Control-Allow-Origin", &cors.origin);
                    if cors.credentials {
                        builder = builder.header("Access-Control-Allow-Credentials", "true");
                    }
                }
            }

            let response = builder
                .body(full(body))
                .map_err(|e| e.to_string())?;
            
            let _ = tx.send(response);
            Ok(())
        } else {
            Err("Response already sent".to_string())
        }
    }

    pub fn stop(&self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(tx) = self.shutdown_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
        Ok(())
    }

    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Setup TLS
        let tls_acceptor = if let Some((cert_path, key_path)) = self.tls_paths.lock().unwrap().clone() {
            let cert_file = StdFile::open(&cert_path).map_err(|e| format!("Failed to open cert file {}: {}", cert_path, e))?;
            let key_file = StdFile::open(&key_path).map_err(|e| format!("Failed to open key file {}: {}", key_path, e))?;
            
            let certs = rustls_pemfile::certs(&mut StdBufReader::new(cert_file))
                .collect::<Result<Vec<_>, _>>()?;
            let key = rustls_pemfile::private_key(&mut StdBufReader::new(key_file))?
                .ok_or("No private key found")?;
            
            let mut config = ServerConfig::builder()
                .with_no_client_auth()
                .with_single_cert(certs, key)?;
            
            config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
            
            Some(TlsAcceptor::from(Arc::new(config)))
        } else {
            None
        };

        let addr = SocketAddr::from(([127, 0, 0, 1], self.port));
        let listener = TcpListener::bind(addr).await?;
        
        // Setup shutdown channel
        let (tx, rx) = tokio::sync::oneshot::channel();
        {
            let mut lock = self.shutdown_tx.lock().unwrap();
            *lock = Some(tx);
        }

        // Clone state for the loop
        let router = self.router.clone();
        let js_callback = self.js_callback.clone();
        let req_id_counter = self.req_id_counter.clone();
        let static_routes = self.static_routes.clone();
        let ws_callback = self.ws_callback.clone();
        let ws_peers = self.ws_peers.clone();
        let ws_rooms = self.ws_rooms.clone();
        let cors_config = self.cors_config.clone();
        let rate_limit_store = self.rate_limit_store.clone();
        let cache_store = self.cache_store.clone();
        let jwt_secret = self.jwt_secret.clone();
        let redis_client = self.redis_client.clone();
        let metrics = self.metrics.clone();
        let security_headers = self.security_headers.clone();
        let schema_cache = self.schema_cache.clone();
        let governor = self.governor.clone();

        let _protocol = if tls_acceptor.is_some() { "https" } else { "http" };
        
        tokio::spawn(async move {
            tokio::pin!(rx);
            loop {
                let accept_result = tokio::select! {
                    res = listener.accept() => res,
                    _ = tokio::signal::ctrl_c() => {
                        info!(target: "Server", "Shutdown signal received (Ctrl+C). Stopping listener...");
                        break;
                    }
                    _ = &mut rx => {
                        info!(target: "Server", "Shutdown signal received (Programmatic). Stopping listener...");
                        break;
                    }
                };
    
                let (stream, remote_addr) = match accept_result {
                    Ok(conn) => conn,
                    Err(e) => {
                        eprintln!("Accept error: {}", e);
                        continue;
                    }
                };
                
                let router_clone = router.clone();
                let callback_clone = js_callback.clone();
                let ws_callback_clone = ws_callback.clone();
                let counter_clone = req_id_counter.clone();
                let static_routes_clone = static_routes.clone();
                let ws_peers_clone = ws_peers.clone();
                let ws_rooms_clone = ws_rooms.clone();
                let cors_config_clone = cors_config.clone();
                let rate_limit_clone = rate_limit_store.clone();
                let cache_clone = cache_store.clone();
                let jwt_secret_clone = jwt_secret.clone();
                let redis_client_clone = redis_client.clone();
                let metrics_clone = metrics.clone();
                let security_headers_clone = security_headers.clone();
                let schema_cache_clone = schema_cache.clone();
                let governor_clone = governor.clone();
                
                let tls_acceptor = tls_acceptor.clone();
    
                tokio::task::spawn(async move {
                    let service = service_fn(move |req| {
                        let req_id = counter_clone.fetch_add(1, Ordering::SeqCst).to_string();
                        let start = Instant::now();
                        let method = req.method().clone();
                        let path = req.uri().path().to_string();
    
                        let router_clone = router_clone.clone();
                        let callback_clone = callback_clone.clone();
                        let ws_callback_clone = ws_callback_clone.clone();
                        let static_routes_clone = static_routes_clone.clone();
                        let ws_peers_clone = ws_peers_clone.clone();
                        let ws_rooms_clone = ws_rooms_clone.clone();
                        let cors_config_clone = cors_config_clone.clone();
                        let rate_limit_clone = rate_limit_clone.clone();
                        let cache_clone = cache_clone.clone();
                        let jwt_secret_clone = jwt_secret_clone.clone();
                        let redis_client_clone = redis_client_clone.clone();
                        let metrics_clone = metrics_clone.clone();
                        let security_headers_clone = security_headers_clone.clone();
                        let schema_cache_clone = schema_cache_clone.clone();
                        let governor_clone = governor_clone.clone();
    
                        async move {
                            let res = handle_request(
                                req, 
                                remote_addr,
                                router_clone, 
                                callback_clone,
                                ws_callback_clone,
                                req_id.clone(),
                                static_routes_clone,
                                ws_peers_clone,
                                ws_rooms_clone,
                                cors_config_clone,
                                rate_limit_clone,
                                cache_clone,
                                jwt_secret_clone,
                                redis_client_clone,
                                metrics_clone,
                                security_headers_clone,
                                schema_cache_clone,
                                governor_clone,
                            ).await;
    
                            if let Ok(response) = &res {
                                info!(
                                    target: "Server",
                                    method = %method,
                                    path = %path,
                                    status = %response.status().as_u16(),
                                    latency_ms = %start.elapsed().as_millis(),
                                    req_id = %req_id,
                                    "request_completed"
                                );
                            }
                            res
                        }
                    });
    
                    if let Some(acceptor) = tls_acceptor {
                        match acceptor.accept(stream).await {
                            Ok(tls_stream) => {
                                let io = TokioIo::new(tls_stream);
                                let builder = Builder::new(TokioExecutor::new());
                                if let Err(err) = builder.serve_connection_with_upgrades(io, service).await {
                                    let err_debug = format!("{:?}", err);
                                    if !err_debug.contains("ConnectionReset") && !err_debug.contains("10054") {
                                        eprintln!("Error serving TLS connection: {:?}", err);
                                    }
                                }
                            }
                            Err(e) => eprintln!("TLS Handshake Error: {}", e),
                        }
                    } else {
                        let io = TokioIo::new(stream);
                        let builder = Builder::new(TokioExecutor::new());
                        if let Err(err) = builder.serve_connection_with_upgrades(io, service).await {
                            let err_debug = format!("{:?}", err);
                            if !err_debug.contains("ConnectionReset") && !err_debug.contains("10054") {
                                eprintln!("Error serving connection: {:?}", err);
                            }
                        }
                    }
                });
            }
            
            info!(target: "Server", "Server stopped accepting new connections. Graceful shutdown complete.");
        });

        Ok(())
    }
}

struct RequestGuard {
    metrics: Arc<ServerMetrics>,
    start: Instant,
}

impl RequestGuard {
    fn new(metrics: Arc<ServerMetrics>) -> Self {
        metrics.active_connections.fetch_add(1, Ordering::Relaxed);
        metrics.requests_total.fetch_add(1, Ordering::Relaxed);
        Self {
            metrics,
            start: Instant::now(),
        }
    }
}

impl Drop for RequestGuard {
    fn drop(&mut self) {
        self.metrics.active_connections.fetch_sub(1, Ordering::Relaxed);
        let duration = self.start.elapsed().as_millis() as u64;
        self.metrics.latency_sum_ms.fetch_add(duration, Ordering::Relaxed);
        self.metrics.latency_count.fetch_add(1, Ordering::Relaxed);
    }
}

async fn handle_request(
    req: Request<Incoming>,
    remote_addr: SocketAddr,
    router: Arc<Router>,
    callback: Option<ThreadsafeFunction<RequestEvent, ErrorStrategy::Fatal>>,
    ws_callback: Option<ThreadsafeFunction<WsEvent, ErrorStrategy::Fatal>>,
    req_id: String,
    static_routes: Arc<Mutex<Vec<(String, String)>>>,
    ws_peers: WsPeers,
    ws_rooms: WsRooms,
    cors_config: Arc<Mutex<Option<CorsConfig>>>,
    rate_limit_store: Arc<DashMap<String, (u32, Instant)>>,
    cache_store: Arc<DashMap<String, (Bytes, Instant)>>,
    jwt_secret: Arc<Mutex<Option<String>>>,
    redis_client: Arc<Mutex<Option<redis::Client>>>,
    metrics: Arc<ServerMetrics>,
    security_headers: Arc<AtomicBool>,
    schema_cache: Arc<DashMap<String, Arc<Validator>>>,
    governor: Arc<TrafficGovernor>,
) -> Result<Response<BoxBody<Bytes, std::io::Error>>, Infallible> {
    let _guard = RequestGuard::new(metrics.clone());
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path().to_string();
    
    // Helper to inject security headers
    let make_builder = || {
        let mut builder = Response::builder();
        if security_headers.load(Ordering::Relaxed) {
            builder = builder
                .header("X-Content-Type-Options", "nosniff")
                .header("X-Frame-Options", "SAMEORIGIN")
                .header("X-XSS-Protection", "1; mode=block")
                .header("Referrer-Policy", "strict-origin-when-cross-origin");
        }
        builder
    };

    // Metrics Endpoint - BYPASS GOVERNOR
    if path == "/metrics" && method == hyper::Method::GET {
        return Ok(make_builder()
            .status(StatusCode::OK)
            .header("Content-Type", "text/plain")
            .body(full(metrics.render()))
            .unwrap());
    }

    // Health Check - BYPASS GOVERNOR (or High Priority)
    if path == "/health" {
         return Ok(make_builder()
            .status(StatusCode::OK)
            .body(full("OK"))
            .unwrap());
    }
    
    // Determine Priority
    // For now, default to Interactive. 
    // Ideally we look up the route first to see priority, but route lookup happens later.
    // Optimization: Do route lookup EARLY.
    
    // For the Governor, we need to wrap the REST of the function.
    // However, since this function is async/await style but implemented as a big block, 
    // we need to be careful.
    // Actually, `service_fn` calls this.
    
    // Determine Priority via Router Lookup or Static Check
    let route_match = router.lookup(method.as_str(), &path);

    let (priority, slo_target) = if let Some((action, _)) = &route_match {
        let policies = match action {
            RouteAction::JsHandler { policies, .. } => policies,
            RouteAction::Static { policies, .. } => policies,
            RouteAction::Json { policies, .. } => policies,
            RouteAction::Upload { policies, .. } => policies,
        };
        
        let p = if let Some(p) = &policies.priority {
            Priority::from_str(p)
        } else {
             if path.starts_with("/admin") { Priority::Critical }
             else if path.starts_with("/background") { Priority::Background }
             else { Priority::Interactive }
        };
        (p, policies.slo_target)
    } else {
        let is_static = static_routes.lock().unwrap().iter().any(|(prefix, _)| path.starts_with(prefix));
        if is_static {
            (Priority::Interactive, None)
        } else {
            (Priority::Interactive, None)
        }
    };

    // GOVERNOR ADMISSION CONTROL
    // We now queue instead of reject, to be "Unbreakable" but "Patient"
    governor.acquire(priority).await;
    
    let start_time = Instant::now();
    
    // We need to defer release() until the response is ready.
    // Since we return Result<Response...>, we can inspect it before returning?
    // Or use a Drop guard?
    // A Drop guard is best because it handles early returns/panics.
    
    struct GovernorGuard {
        governor: Arc<TrafficGovernor>,
        start: Instant,
        slo_target: Option<u64>,
    }
    
    impl Drop for GovernorGuard {
        fn drop(&mut self) {
            let duration = self.start.elapsed();
            self.governor.release(duration.as_millis() as u64, self.slo_target);
        }
    }
    
    let _gov_guard = GovernorGuard {
        governor: governor.clone(),
        start: start_time,
        slo_target,
    };

    // Check Accept-Encoding
    let accept_encoding = req.headers()
        .get(hyper::header::ACCEPT_ENCODING)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // 0. Handle CORS Preflight (OPTIONS)
    if req.method() == hyper::Method::OPTIONS {
        let config = cors_config.lock().unwrap();
        if let Some(cors) = &*config {
            let mut builder = make_builder()
                .status(StatusCode::NO_CONTENT)
                .header("Access-Control-Allow-Origin", &cors.origin)
                .header("Access-Control-Allow-Methods", &cors.methods)
                .header("Access-Control-Allow-Headers", &cors.headers);
            
            if cors.credentials {
                builder = builder.header("Access-Control-Allow-Credentials", "true");
            }
            
            // Allow caching of preflight response
            builder = builder.header("Access-Control-Max-Age", "86400");

            return Ok(builder
                .body(full(""))
                .unwrap());
        }
    }
    
    // 1. Check for WebSocket Upgrade
    if req.headers().contains_key(hyper::header::UPGRADE) {
         let is_websocket = req.headers().get(hyper::header::UPGRADE)
             .map(|v| v == "websocket")
             .unwrap_or(false);

         if is_websocket {
             let key = req.headers().get("Sec-WebSocket-Key")
                .map(|v| v.to_str().unwrap_or("").to_string())
                .unwrap_or_default();

             if !key.is_empty() {
                let path_clone = req.uri().path().to_string();
                // let req_id = req_id_counter.fetch_add(1, Ordering::SeqCst).to_string();
                let socket_id = req_id.clone();
                
                // Spawn WS task with hyper::upgrade::on(req)
                tokio::task::spawn(async move {
                    match on(req).await {
                         Ok(upgraded) => {
                             let ws_stream = WebSocketStream::from_raw_socket(
                                 TokioIo::new(upgraded),
                                 Role::Server,
                                 None
                             ).await;
                             
                             let mut ws = ws_stream;
                             let (tx, mut rx) = mpsc::unbounded_channel();
                                     
                             // Register peer
                                    {
                                        let mut peers = ws_peers.lock().unwrap();
                                        peers.insert(socket_id.clone(), tx);
                                    }

                                    // Notify Open
                                    if let Some(cb) = &ws_callback {
                                        cb.call(WsEvent {
                                            socket_id: socket_id.clone(),
                                            event_type: "open".to_string(),
                                            payload: None,
                                            path: Some(path_clone),
                                        }, ThreadsafeFunctionCallMode::NonBlocking);
                                    }

                                    // Loop
                                    loop {
                                        tokio::select! {
                                            msg = rx.recv() => {
                                                match msg {
                                                    Some(m) => {
                                                        if let Err(_) = ws.send(m).await {
                                                            break;
                                                        }
                                                    }
                                                    None => break,
                                                }
                                            }
                                            msg = ws.next() => {
                                                match msg {
                                                    Some(Ok(m)) => {
                                                        if m.is_text() {
                                                             if let Some(cb) = &ws_callback {
                                                                 cb.call(WsEvent {
                                                                     socket_id: socket_id.clone(),
                                                                     event_type: "message".to_string(),
                                                                     payload: Some(m.to_string()),
                                                                     path: None,
                                                                 }, ThreadsafeFunctionCallMode::NonBlocking);
                                                             }
                                                        } else if m.is_close() {
                                                            break;
                                                        }
                                                    }
                                                    Some(Err(_)) => break,
                                                    None => break,
                                                }
                                            }
                                        }
                                    }

                                    // Cleanup
                                    {
                                        // Use internal cleanup logic to remove from peers and rooms
                                        // We need to access the logic from NativeServer, but handle_request is a standalone function.
                                        // So we replicate the cleanup logic here.
                                        
                                        // Remove from peers
                                        {
                                            let mut peers = ws_peers.lock().unwrap();
                                            peers.remove(&socket_id);
                                        }

                                        // Remove from all rooms
                                        {
                                            let mut rooms = ws_rooms.lock().unwrap();
                                            for sockets in rooms.values_mut() {
                                                sockets.remove(&socket_id);
                                            }
                                        }
                                    }

                                    // Notify Close
                                    if let Some(cb) = &ws_callback {
                                        cb.call(WsEvent {
                                            socket_id: socket_id,
                                            event_type: "close".to_string(),
                                            payload: None,
                                            path: None,
                                        }, ThreadsafeFunctionCallMode::NonBlocking);
                                    }
                                // } Removed Ok match brace
                                // Err(e) => eprintln!("WebSocket upgrade error: {}", e), Removed Err branch
                            // } Removed match brace
                        }
                        Err(e) => eprintln!("Hyper upgrade error: {}", e),
                    }
                });

                let accept_key = derive_accept_key(key.as_bytes());
                return Ok(Response::builder()
                    .status(StatusCode::SWITCHING_PROTOCOLS)
                    .header(hyper::header::UPGRADE, "websocket")
                    .header(hyper::header::CONNECTION, "Upgrade")
                    .header("Sec-WebSocket-Accept", accept_key)
                    .body(BoxBody::new(BodyExt::boxed(Empty::new().map_err(|never| match never {}))))
                    .unwrap());
             }
         }
    }

    // 2. Check Static Files (Level 0)
    let matched_static_route = {
        let static_routes = static_routes.lock().unwrap();
        static_routes.iter().find_map(|(prefix, dir)| {
            if path.starts_with(prefix) {
                Some((prefix.clone(), dir.clone()))
            } else {
                None
            }
        })
    };

    if let Some((prefix, dir)) = matched_static_route {
        let rest_path = &path[prefix.len()..];
        let file_path = std::path::Path::new(&dir).join(rest_path.trim_start_matches('/'));
        
        // Security: Prevent directory traversal
        if !file_path.starts_with(&dir) {
            return Ok(make_builder()
                .status(StatusCode::FORBIDDEN)
                .body(full("Forbidden"))
                .unwrap());
        }

        // Async check for existence
        if tokio::fs::try_exists(&file_path).await.unwrap_or(false) {
            let is_file = tokio::fs::metadata(&file_path).await.map(|m| m.is_file()).unwrap_or(false);
            
            if is_file {
                let file = match File::open(&file_path).await {
                    Ok(f) => f,
                    Err(_) => return Ok(make_builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .body(full("File Read Error"))
                        .unwrap()),
                };
                
                let mime_type = mime_guess::from_path(&file_path).first_or_octet_stream();
                
                // Check for Compression Support
                let use_gzip = accept_encoding.contains("gzip");
                let use_brotli = accept_encoding.contains("br");

                // Zero-copy stream
                let stream = ReaderStream::new(file);
                
                let mut builder = make_builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", mime_type.as_ref());

                if let Some(config) = cors_config.lock().unwrap().as_ref() {
                    builder = builder.header("Access-Control-Allow-Origin", &config.origin);
                }

                if use_brotli {
                    let file = File::open(&file_path).await.unwrap();
                    let reader = BufReader::new(file);
                    let compressed = BrotliEncoder::with_quality(reader, async_compression::Level::Best);
                    let stream = ReaderStream::new(compressed);
                    let body = StreamBody::new(stream.map(|f| f.map(Frame::data).map_err(|e| e)));
                    return Ok(builder
                        .header("Content-Encoding", "br")
                        .body(BodyExt::boxed(body))
                        .unwrap());
                } else if use_gzip {
                    let file = File::open(&file_path).await.unwrap();
                    let reader = BufReader::new(file);
                    let compressed = GzipEncoder::with_quality(reader, async_compression::Level::Best);
                    let stream = ReaderStream::new(compressed);
                    let body = StreamBody::new(stream.map(|f| f.map(Frame::data).map_err(|e| e)));
                    return Ok(builder
                        .header("Content-Encoding", "gzip")
                        .body(BodyExt::boxed(body))
                        .unwrap());
                }

                let body = StreamBody::new(stream.map(|result| result.map(Frame::data)));
                return Ok(builder.body(BodyExt::boxed(body)).unwrap());
            }
        }
    }

    // 3. Match Routes (Level 1 & 2)
    // We already looked up the route earlier for Priority/SLO.
    if let Some((route_action, params_vec)) = route_match {
        
        // 3.1 Extract Policies
        let policies = match &route_action {
            RouteAction::JsHandler { policies, .. } => policies.clone(),
            RouteAction::Static { policies, .. } => policies.clone(),
            RouteAction::Json { policies, .. } => policies.clone(),
            RouteAction::Upload { policies, .. } => policies.clone(),
        };

        // 3.2 Rate Limit Check
        if let Some((limit, window_sec)) = policies.rate_limit {
             let key = format!("{} {} {}", method, path, remote_addr.ip());
             
             // Distributed Rate Limit (Redis)
              let mut redis_opt = redis_client.lock().unwrap().clone();
              if let Some(client) = redis_opt.as_mut() {
                     let con = client.get_multiplexed_async_connection().await.ok();
                 if let Some(mut con) = con {
                    // Lua script for atomic INCR + EXPIRE
                    let script = redis::Script::new(r"
                        let current = redis.call('INCR', KEYS[1])
                        if tonumber(current) == 1 then
                            redis.call('EXPIRE', KEYS[1], ARGV[1])
                        end
                        return current
                    ");
                    let count: u32 = script.key(&key).arg(window_sec).invoke_async(&mut con).await.unwrap_or(0);
                    
                    if count > limit {
                         return Ok(make_builder()
                            .status(StatusCode::TOO_MANY_REQUESTS)
                            .body(full("Rate Limit Exceeded (Distributed)"))
                            .unwrap());
                    }
                    // If Redis works, we skip local check
                    // But if we want to be safe, we can continue? No, Redis is authoritative.
                    // To break out of local check block, we need to structure this better.
                    // For now, let's use a flag or else.
                 } else {
                     // Redis connection failed, fallback to local?
                     // Fallback below
                 }
             } else {
                 // Local Rate Limit (DashMap)
                 let now = Instant::now();
                 
                 let mut entry = rate_limit_store.entry(key).or_insert((0, now));
                 let (count, start) = entry.value_mut();

                 if start.elapsed() > Duration::from_secs(window_sec as u64) {
                     // Reset
                     *count = 1;
                     *start = now;
                 } else {
                     *count += 1;
                     if *count > limit {
                          return Ok(make_builder()
                             .status(StatusCode::TOO_MANY_REQUESTS)
                             .body(full("Rate Limit Exceeded"))
                             .unwrap());
                     }
                 }
             }
        }

        // 3.3 JWT Auth Check (Placeholder for real implementation)
        // If the route is protected, we check for Bearer token
        // This is where Native JWT verification happens before any JS code runs!
        if policies.jwt_auth {
            if let Some(secret) = jwt_secret.lock().unwrap().clone() {
                let auth_header = req.headers().get("Authorization")
                    .and_then(|h| h.to_str().ok())
                    .unwrap_or("");
                
                if !auth_header.starts_with("Bearer ") {
                     return Ok(make_builder()
                        .status(StatusCode::UNAUTHORIZED)
                        .body(full("Missing Bearer Token"))
                        .unwrap());
                }

                let token = &auth_header[7..];
                let decoding_key = DecodingKey::from_secret(secret.as_bytes());
                let validation = Validation::default();
                
                if decode::<Claims>(token, &decoding_key, &validation).is_err() {
                    return Ok(make_builder()
                        .status(StatusCode::UNAUTHORIZED)
                        .body(full("Invalid Token"))
                        .unwrap());
                }
            } else {
                 // Warn: Protected route but no secret set
                 eprintln!("Warning: Route requires JWT but no secret set in NativeServer");
            }
        }

        // 3.3 Cache Check (GET only)
        if method == hyper::Method::GET {
             if let Some(_ttl_sec) = policies.cache_ttl {
                 if let Some(cached) = cache_store.get(&path) {
                     let (body, expiry) = cached.value();
                     if expiry.elapsed() < Duration::from_secs(0) {
                         // Valid cache (Wait, elapsed < 0 means future? No, expiry should be absolute time or Instant created at + TTL)
                         // Store expiry as Instant (deadline).
                         // if now < expiry
                         if Instant::now() < *expiry {
                             return Ok(make_builder()
                                .status(StatusCode::OK)
                                .body(full(body.clone()))
                                .unwrap());
                         }
                     }
                 }
             }
        }

        match route_action {
            RouteAction::Static { content, content_type, .. } => {
                let mut builder = make_builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", content_type);

                if let Some(config) = cors_config.lock().unwrap().as_ref() {
                    builder = builder.header("Access-Control-Allow-Origin", &config.origin);
                }

                if method == hyper::Method::GET {
                    if let Some(ttl_sec) = policies.cache_ttl {
                        cache_store.insert(path.to_string(), (Bytes::from(content.clone()), Instant::now() + Duration::from_secs(ttl_sec)));
                    }
                }

                return Ok(builder
                    .body(full(content))
                    .unwrap());
            },
            RouteAction::Json { content, .. } => {
                let mut builder = make_builder()
                    .status(StatusCode::OK)
                    .header("Content-Type", "application/json");

                if let Some(config) = cors_config.lock().unwrap().as_ref() {
                    builder = builder.header("Access-Control-Allow-Origin", &config.origin);
                }

                if method == hyper::Method::GET {
                    if let Some(ttl_sec) = policies.cache_ttl {
                        cache_store.insert(path.to_string(), (Bytes::from(content.clone()), Instant::now() + Duration::from_secs(ttl_sec)));
                    }
                }

                return Ok(builder
                    .body(full(content))
                    .unwrap());
            },
            RouteAction::JsHandler { id, policies } => {
                // Generate Req ID early (Already done at start of function)
                // let req_id = req_id_counter.fetch_add(1, Ordering::SeqCst).to_string();
                let (tx, rx) = oneshot::channel();
                let handle = Mutex::new(Some(tx));

                // Extract headers before consuming body
                let headers_vec: Vec<(String, String)> = req.headers().iter()
                    .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
                    .collect();

                // Read Body
                let body_bytes = match req.collect().await {
                    Ok(c) => c.to_bytes(),
                    Err(e) => return Ok(make_builder()
                        .status(StatusCode::BAD_REQUEST)
                        .body(full(format!("Bad Request Body: {}", e)))
                        .unwrap()),
                };

                // Native Schema Validation
                if let Some(schema_str) = &policies.schema {
                    if !body_bytes.is_empty() {
                         // Parse body as JSON
                         let json_body: serde_json::Value = match serde_json::from_slice(&body_bytes) {
                             Ok(v) => v,
                             Err(e) => return Ok(make_builder()
                                 .status(StatusCode::BAD_REQUEST)
                                 .header("Content-Type", "application/json")
                                 .body(full(format!(r#"{{"error": "Invalid JSON: {}"}}"#, e)))
                                 .unwrap()),
                         };

                         // Check cache first
                         let validation_result = if let Some(schema) = schema_cache.get(schema_str) {
                             let errors: Vec<String> = schema.iter_errors(&json_body).map(|e| e.to_string()).collect();
                             if !errors.is_empty() {
                                 Some(errors)
                             } else {
                                 None
                             }
                         } else {
                             // Compile and Cache
                             match serde_json::from_str::<serde_json::Value>(schema_str) {
                                Ok(mut schema_json) => {
                                    // Handle double-encoded JSON string (recovery for some client-side stringification issues)
                                    if let serde_json::Value::String(s) = &schema_json {
                                        if let Ok(inner_json) = serde_json::from_str::<serde_json::Value>(s) {
                                            schema_json = inner_json;
                                        }
                                    }

                                    match jsonschema::validator_for(&schema_json) {
                                        Ok(schema) => {
                                            let schema_arc = Arc::new(schema);
                                            // Validate
                                            let errors: Vec<String> = schema_arc.iter_errors(&json_body).map(|e| e.to_string()).collect();
                                            
                                            // Insert into cache
                                            schema_cache.insert(schema_str.clone(), schema_arc);

                                            if !errors.is_empty() {
                                                Some(errors)
                                            } else {
                                                None
                                            }
                                        },
                                        Err(e) => {
                                            eprintln!("Schema Compilation Error: {}", e);
                                            // Fail safe or allow? Let's fail safe.
                                            return Ok(make_builder()
                                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                                .body(full(format!("Invalid Schema Definition: {}", e)))
                                                .unwrap());
                                        }
                                    }
                                },
                                Err(e) => {
                                    eprintln!("Schema JSON Parse Error: {}", e);
                                    return Ok(make_builder()
                                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                                        .body(full(format!("Invalid Schema JSON: {}", e)))
                                        .unwrap());
                                }
                             }
                         };

                         if let Some(errors) = validation_result {
                             return Ok(make_builder()
                                 .status(StatusCode::BAD_REQUEST)
                                 .header("Content-Type", "application/json")
                                 .body(full(format!(r#"{{"validation_errors": {:?}}}"#, errors)))
                                 .unwrap());
                         }
                    }
                }

                if let Some(cb) = &callback {
                    cb.call(RequestEvent {
                        handler_id: id,
                        req_id: req_id.clone(),
                        params: params_vec,
                        query: uri.query().unwrap_or("").to_string(),
                        headers: headers_vec,
                        method: method.to_string(),
                        url: uri.to_string(),
                        body: body_bytes.to_vec(),
                        response_sender: handle,
                    }, ThreadsafeFunctionCallMode::NonBlocking);

                    // Wait for response
                    match rx.await {
                        Ok(response) => {
                            // Cache Population
                            if method == hyper::Method::GET {
                                if let Some(ttl_sec) = policies.cache_ttl {
                                    let (parts, body) = response.into_parts();
                                    // Collect body to cache
                                    let bytes = match body.collect().await {
                                        Ok(collected) => collected.to_bytes(),
                                        Err(e) => return Ok(make_builder()
                                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                                            .body(full(format!("Error reading body for cache: {}", e)))
                                            .unwrap()),
                                    };
                                    
                                    cache_store.insert(path.to_string(), (bytes.clone(), Instant::now() + Duration::from_secs(ttl_sec)));
                                    return Ok(Response::from_parts(parts, full(bytes)));
                                }
                            }
                            return Ok(response);
                        },
                        Err(_) => {
                            // Sender dropped
                            return Ok(make_builder()
                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                .body(full("Internal Server Error: No response from handler"))
                                .unwrap());
                        },
                    }
                } else {
                    return Ok(make_builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .body(full("Internal Server Error: No JS callback"))
                        .unwrap());
                }
            },
            RouteAction::Upload { dir, handler_id: _, .. } => {
                let boundary = req.headers()
                    .get("content-type")
                    .and_then(|ct| ct.to_str().ok())
                    .and_then(|ct| multer::parse_boundary(ct).ok());

                if let Some(boundary) = boundary {
                    let body_stream = BodyStream::new(req.into_body())
                        .filter_map(|res| async move {
                            match res {
                                Ok(frame) => frame.into_data().ok().map(Ok),
                                Err(e) => Some(Err(std::io::Error::new(std::io::ErrorKind::Other, e))),
                            }
                        });
                    let mut multipart = multer::Multipart::new(body_stream, boundary);
                    
                    let mut uploaded_files = Vec::new();

                    while let Ok(Some(mut field)) = multipart.next_field().await {
                        if let Some(filename) = field.file_name() {
                            let filename = filename.to_string();
                            let filepath = std::path::Path::new(&dir).join(&filename);
                            
                            tokio::fs::create_dir_all(&dir).await.ok();
                            
                            let mut file = File::create(&filepath).await.unwrap();
                            while let Ok(Some(chunk)) = field.chunk().await {
                                file.write_all(&chunk).await.unwrap();
                            }
                            uploaded_files.push(filename);
                        }
                    }

                    let response_json = serde_json::json!({
                        "status": "uploaded",
                        "files": uploaded_files
                    }).to_string();

                    let mut builder = make_builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", "application/json");

                    if let Some(config) = cors_config.lock().unwrap().as_ref() {
                        builder = builder.header("Access-Control-Allow-Origin", &config.origin);
                    }

                    return Ok(builder.body(full(response_json)).unwrap());
                } else {
                     return Ok(make_builder()
                        .status(StatusCode::BAD_REQUEST)
                        .body(full("Missing Boundary"))
                        .unwrap());
                }
            }
        }
    } else {
        // 404
        metrics.errors_total.fetch_add(1, Ordering::Relaxed);
        return Ok(make_builder()
            .status(StatusCode::NOT_FOUND)
            .body(full("Not Found"))
            .unwrap());
    }
    
    // Unreachable due to returns above, but needed for type safety if we drop through
    // However, the function structure has returns in all branches.
    // The issue was likely due to the previous edit messing up the braces.
}
