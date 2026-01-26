#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ErrorStrategy, ThreadSafeCallContext};
use std::sync::{Arc, Mutex};
use server::{RequestEvent, WsEvent};
mod database;
mod server;
mod router;
mod governor;

#[napi]
pub struct NativeEngine {
    server: Arc<Mutex<server::NativeServer>>,
    db_manager: Arc<tokio::sync::Mutex<database::DatabaseManager>>,
}

use router::RouteAction;

#[napi(object)]
pub struct RouteOptions {
    pub rate_limit_limit: Option<u32>,
    pub rate_limit_window: Option<u32>,
    pub cache_ttl: Option<u32>,
    pub jwt_auth: Option<bool>,
    pub schema: Option<String>,
    pub priority: Option<String>,
    pub slo_target: Option<u32>,
}

impl From<Option<RouteOptions>> for router::RoutePolicies {
    fn from(options: Option<RouteOptions>) -> Self {
        match options {
            Some(opts) => router::RoutePolicies {
                rate_limit: match (opts.rate_limit_limit, opts.rate_limit_window) {
                    (Some(limit), Some(window)) => Some((limit, window as u64)),
                    _ => None,
                },
                cache_ttl: opts.cache_ttl.map(|ttl| ttl as u64),
                jwt_auth: opts.jwt_auth.unwrap_or(false),
                schema: opts.schema,
                priority: opts.priority,
                slo_target: opts.slo_target.map(|t| t as u64),
            },
            None => router::RoutePolicies::default(),
        }
    }
}

#[napi]
impl NativeEngine {
    #[napi(constructor)]
    pub fn new(port: u16) -> Self {
        Self {
            server: Arc::new(Mutex::new(server::NativeServer::new(port))),
            db_manager: Arc::new(tokio::sync::Mutex::new(database::DatabaseManager::new())),
        }
    }

    #[napi]
    pub fn init_logger(&self) {
        let _ = tracing_subscriber::fmt()
            .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
            .json()
            .try_init();
    }

    #[napi]
    pub async fn connect_postgres(&self, url: String) -> Result<()> {
        let mut db = self.db_manager.lock().await;
        db.connect_postgres(&url).await
    }

    #[napi]
    pub async fn connect_sqlite(&self, url: String) -> Result<()> {
        let mut db = self.db_manager.lock().await;
        db.connect_sqlite(&url).await
    }

    #[napi]
    pub fn connect_redis(&self, url: String) -> Result<()> {
        let mut db = self.db_manager.blocking_lock();
        let client = db.connect_redis(&url)?;
        
        // Pass Redis client to Server for Distributed Rate Limiting
        let server = self.server.lock().unwrap();
        server.set_redis(client);
        
        Ok(())
    }

    #[napi]
    pub fn get_metrics(&self) -> String {
        let server = self.server.lock().unwrap();
        server.get_metrics()
    }

    #[napi]
    pub async fn redis_set(&self, key: String, value: String, ttl: Option<u32>) -> Result<()> {
        let db = self.db_manager.lock().await;
        db.redis_set(&key, &value, ttl.map(|t| t as u64)).await
    }

    #[napi]
    pub async fn redis_get(&self, key: String) -> Result<Option<String>> {
        let db = self.db_manager.lock().await;
        db.redis_get(&key).await
    }

    #[napi]
    pub async fn connect_mongo(&self, url: String) -> Result<()> {
        let mut db = self.db_manager.lock().await;
        db.connect_mongo(&url).await
    }

    #[napi]
    pub async fn query_db(&self, sql: String, ttl: Option<u32>) -> Result<String> {
        let db = self.db_manager.lock().await;
        db.query_with_cache(&sql, ttl).await
    }

    #[napi]
    pub async fn query_db_with_params(&self, sql: String, params: Vec<serde_json::Value>, ttl: Option<u32>) -> Result<String> {
        let db = self.db_manager.lock().await;
        db.query_with_params_and_cache(&sql, params, ttl).await
    }

    #[napi]
    pub async fn query_mongo(&self, db_name: String, coll_name: String, query: String) -> Result<String> {
        let db = self.db_manager.lock().await;
        db.query_mongo(&db_name, &coll_name, &query).await
    }

    #[napi]
    pub fn set_jwt_secret(&self, secret: String) -> Result<()> {
        let server = self.server.lock().unwrap();
        server.set_jwt_secret(secret);
        Ok(())
    }

    #[napi]
    pub fn register_route(&self, method: String, path: String, handler_id: u32, options: Option<RouteOptions>) -> Result<()> {
        let server = self.server.lock().unwrap();
        let policies = options.into();
        server.add_route(&method, &path, RouteAction::JsHandler { id: handler_id, policies }).map_err(|e| Error::from_reason(e))
    }

    #[napi]
    pub fn register_static_route(&self, method: String, path: String, content: String, content_type: String, options: Option<RouteOptions>) -> Result<()> {
        let server = self.server.lock().unwrap();
        let policies = options.into();
        server.add_route(&method, &path, RouteAction::Static { content, content_type, policies }).map_err(|e| Error::from_reason(e))
    }

    #[napi]
    pub fn register_json_route(&self, method: String, path: String, content: String, options: Option<RouteOptions>) -> Result<()> {
        let server = self.server.lock().unwrap();
        let policies = options.into();
        server.add_route(&method, &path, RouteAction::Json { content, policies }).map_err(|e| Error::from_reason(e))
    }

    #[napi]
    pub fn register_upload_route(&self, method: String, path: String, dir: String, handler_id: Option<u32>, options: Option<RouteOptions>) -> Result<()> {
        let server = self.server.lock().unwrap();
        let policies = options.into();
        server.add_route(&method, &path, RouteAction::Upload { dir, handler_id, policies }).map_err(|e| Error::from_reason(e))
    }

    #[napi(ts_args_type = "callback: (event: { handlerId: number, reqId: string, params: string[], query: string, headers: string[], method: string, url: string, body: Buffer, responseHandle: External }) => void")]
    pub fn set_handler(&self, callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<RequestEvent, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<RequestEvent>| {
                let mut obj = ctx.env.create_object()?;
                obj.set("handlerId", ctx.value.handler_id)?;
                obj.set("reqId", ctx.value.req_id.as_str())?;
                obj.set("query", ctx.value.query.as_str())?;
                obj.set("method", ctx.value.method.as_str())?;
                obj.set("url", ctx.value.url.as_str())?;
                
                // Params as flat array [k, v, k, v]
                let mut params_arr = ctx.env.create_array((ctx.value.params.len() * 2) as u32)?;
                for (i, (k, v)) in ctx.value.params.into_iter().enumerate() {
                    params_arr.set((i * 2) as u32, ctx.env.create_string(&k)?)?;
                    params_arr.set((i * 2 + 1) as u32, ctx.env.create_string(&v)?)?;
                }
                obj.set("params", params_arr)?;

                // Headers as flat array [k, v, k, v]
                let mut headers_arr = ctx.env.create_array((ctx.value.headers.len() * 2) as u32)?;
                for (i, (k, v)) in ctx.value.headers.into_iter().enumerate() {
                    headers_arr.set((i * 2) as u32, ctx.env.create_string(&k)?)?;
                    headers_arr.set((i * 2 + 1) as u32, ctx.env.create_string(&v)?)?;
                }
                obj.set("headers", headers_arr)?;

                let body_buffer = ctx.env.create_buffer_with_data(ctx.value.body)?.into_raw();
                obj.set("body", body_buffer)?;

                let external = ctx.env.create_external(ctx.value.response_sender, None)?;
                obj.set("responseHandle", external)?;

                Ok(vec![obj])
            })?;
            
        let mut server = self.server.lock().unwrap();
        server.set_callback(tsfn);
        Ok(())
    }

    #[napi(ts_args_type = "callback: (event: { socketId: string, eventType: string, payload?: string, path?: string }) => void")]
    pub fn set_ws_handler(&self, callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<WsEvent, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<WsEvent>| {
                let mut obj = ctx.env.create_object()?;
                obj.set("socketId", ctx.value.socket_id.as_str())?;
                obj.set("eventType", ctx.value.event_type.as_str())?;
                if let Some(payload) = ctx.value.payload {
                    obj.set("payload", payload.as_str())?;
                }
                if let Some(path) = ctx.value.path {
                    obj.set("path", path.as_str())?;
                }
                Ok(vec![obj])
            })?;
            
        let mut server = self.server.lock().unwrap();
        server.set_ws_callback(tsfn);
        Ok(())
    }

    #[napi]
    pub fn ws_send(&self, socket_id: String, message: String) {
        let server = self.server.lock().unwrap();
        server.ws_send(socket_id, message);
    }

    #[napi]
    pub fn ws_subscribe(&self, socket_id: String, room: String) {
        let server = self.server.lock().unwrap();
        server.ws_subscribe(socket_id, room);
    }

    #[napi]
    pub fn ws_unsubscribe(&self, socket_id: String, room: String) {
        let server = self.server.lock().unwrap();
        server.ws_unsubscribe(socket_id, room);
    }

    #[napi]
    pub fn ws_publish(&self, room: String, message: String) -> Result<()> {
        let server = self.server.lock().unwrap();
        server.ws_publish(room, message);
        Ok(())
    }

    #[napi]
    pub fn set_cors(&self, origin: String, methods: String, headers: String, credentials: bool) -> Result<()> {
        let server = self.server.lock().unwrap();
        server.set_cors(origin, methods, headers, credentials);
        Ok(())
    }

    #[napi]
    pub fn set_security_headers(&self, enabled: bool) -> Result<()> {
        let server = self.server.lock().unwrap();
        server.set_security_headers(enabled);
        Ok(())
    }

    #[napi]
    pub fn set_tls(&self, cert_path: String, key_path: String) -> Result<()> {
        let server = self.server.lock().unwrap();
        server.set_tls(cert_path, key_path);
        Ok(())
    }

    #[napi]
    pub fn add_static_route(&self, prefix: String, dir: String) {
        let server = self.server.lock().unwrap();
        server.add_static_route(prefix, dir);
    }

    #[napi]
    pub fn send_response(&self, handle: External<Mutex<Option<server::ResponseSender>>>, status: u16, body: String) -> Result<()> {
        let server = self.server.lock().unwrap();
        server.send_response(&handle, status, body).map_err(|e| Error::from_reason(e))
    }

    #[napi]
    pub fn send_json(&self, handle: External<Mutex<Option<server::ResponseSender>>>, status: u16, body: serde_json::Value) -> Result<()> {
        let json_string = serde_json::to_string(&body).map_err(|e| Error::from_reason(e.to_string()))?;
        self.send_response(handle, status, json_string)
    }

    #[napi]
    pub fn send_html(&self, handle: External<Mutex<Option<server::ResponseSender>>>, status: u16, body: String) -> Result<()> {
        let server = self.server.lock().unwrap();
        server.send_html(&handle, status, body).map_err(|e| Error::from_reason(e))
    }

    #[napi]
    pub fn stop(&self) -> Result<()> {
        let server = self.server.lock().unwrap();
        server.stop().map_err(|e| Error::from_reason(e.to_string()))
    }

    #[napi]
    pub async fn start(&self) -> Result<()> {
        let server = {
            let guard = self.server.lock().unwrap();
            guard.clone()
        };

        match server.start().await {
            Ok(_) => Ok(()),
            Err(e) => Err(Error::from_reason(e.to_string())),
        }
    }
}
