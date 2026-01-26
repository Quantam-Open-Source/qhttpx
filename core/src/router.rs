use matchit::Router as MatchitRouter;
use std::sync::{Arc, RwLock};

#[derive(Clone, Debug, Default)]
pub struct RoutePolicies {
    pub rate_limit: Option<(u32, u64)>, // limit, window_sec
    pub cache_ttl: Option<u64>, // ttl_sec
    pub jwt_auth: bool, // true if route requires Bearer token
    pub schema: Option<String>, // JSON Schema string for validation
    pub priority: Option<String>,
    pub slo_target: Option<u64>,
}

#[derive(Clone, Debug)]
pub enum RouteAction {
    JsHandler {
        id: u32,
        policies: RoutePolicies,
    },
    Static {
        content: String,
        content_type: String,
        policies: RoutePolicies,
    },
    Json {
        content: String,
        policies: RoutePolicies,
    },
    Upload {
        dir: String,
        #[allow(dead_code)]
        handler_id: Option<u32>, // Optional JS handler to call after upload
        policies: RoutePolicies,
    },
}

pub struct Router {
    inner: Arc<RwLock<MatchitRouter<RouteAction>>>,
}

impl Router {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(MatchitRouter::new())),
        }
    }

    pub fn add(&self, method: &str, path: &str, action: RouteAction) -> Result<(), String> {
        let mut router = self.inner.write().map_err(|e| e.to_string())?;
        // matchit requires paths to start with /
        // We prefix the method: "/GET/users"
        let key = format!("/{}{}", method, path);
        // println!("Adding route: {}", key);
        router.insert(key, action).map_err(|e| e.to_string())
    }

    pub fn lookup(&self, method: &str, path: &str) -> Option<(RouteAction, Vec<(String, String)>)> {
        let router = self.inner.read().ok()?;
        let key = format!("/{}{}", method, path);
        // println!("Looking up: {}", key);
        
        match router.at(&key) {
            Ok(match_result) => {
                let params: Vec<(String, String)> = match_result
                    .params
                    .iter()
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect();
                Some((match_result.value.clone(), params))
            }
            Err(_) => {
                // Try wildcard for static files if no direct match
                // We might need a special handler ID for static files?
                // Or user registers "GET /public/*filepath" -> Handler ID 999
                None
            },
        }
    }
}
