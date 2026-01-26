
use sqlx::{postgres::PgPoolOptions, sqlite::SqlitePoolOptions, Pool, Postgres, Sqlite, Row, Column, TypeInfo};
use std::sync::Arc;
use redis::AsyncCommands;
use napi::Result;
use mongodb::{Client, options::ClientOptions};
use futures_util::stream::TryStreamExt;
use dashmap::DashMap;
use std::time::{Duration, Instant};
use serde_json::{Map, Value};

#[derive(Clone)]
pub enum DatabasePool {
    Postgres(Pool<Postgres>),
    Sqlite(Pool<Sqlite>),
    None,
}

#[derive(Clone)]
pub struct DatabaseManager {
    pool: DatabasePool,
    redis: Option<redis::Client>,
    mongo: Option<Client>,
    query_cache: Arc<DashMap<String, (String, Instant)>>,
}

impl DatabaseManager {
    pub fn new() -> Self {
        Self {
            pool: DatabasePool::None,
            redis: None,
            mongo: None,
            query_cache: Arc::new(DashMap::new()),
        }
    }

    pub async fn connect_mongo(&mut self, url: &str) -> Result<()> {
        let client_options = ClientOptions::parse(url).await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let client = Client::with_options(client_options)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        self.mongo = Some(client);
        Ok(())
    }

    pub async fn query_mongo(&self, db_name: &str, coll_name: &str, query_json: &str) -> Result<String> {
        if let Some(client) = &self.mongo {
            let db = client.database(db_name);
            let coll = db.collection::<mongodb::bson::Document>(coll_name);
            
            let filter_doc: mongodb::bson::Document = serde_json::from_str(query_json)
                .map_err(|e| napi::Error::from_reason(format!("Invalid JSON query: {}", e)))?;

            let mut cursor = coll.find(filter_doc, None).await
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            
            let mut results = Vec::new();
            while let Some(doc) = cursor.try_next().await.map_err(|e| napi::Error::from_reason(e.to_string()))? {
                 // Convert BSON doc to JSON Value then to String
                 let json_val: serde_json::Value = mongodb::bson::to_bson(&doc)
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?
                    .into_relaxed_extjson();
                 results.push(json_val);
            }
            
            serde_json::to_string(&results).map_err(|e| napi::Error::from_reason(e.to_string()))
        } else {
            Err(napi::Error::from_reason("No MongoDB connected"))
        }
    }

    pub async fn connect_postgres(&mut self, url: &str) -> Result<()> {
        let pool = PgPoolOptions::new()
            .max_connections(20)
            .connect(url)
            .await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        self.pool = DatabasePool::Postgres(pool);
        Ok(())
    }

    pub async fn connect_sqlite(&mut self, url: &str) -> Result<()> {
        let pool = SqlitePoolOptions::new()
            .max_connections(20)
            .connect(url)
            .await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        self.pool = DatabasePool::Sqlite(pool);
        Ok(())
    }

    pub fn connect_redis(&mut self, url: &str) -> Result<redis::Client> {
        let client = redis::Client::open(url)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        self.redis = Some(client.clone());
        Ok(client)
    }

    pub async fn redis_set(&self, key: &str, value: &str, ttl_sec: Option<u64>) -> Result<()> {
        if let Some(client) = &self.redis {
            let mut con = client.get_multiplexed_async_connection().await
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            
            if let Some(ttl) = ttl_sec {
                let _: () = con.set_ex(key, value, ttl as u64).await
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            } else {
                let _: () = con.set(key, value).await
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            }
            Ok(())
        } else {
            Err(napi::Error::from_reason("No Redis connected"))
        }
    }

    pub async fn redis_get(&self, key: &str) -> Result<Option<String>> {
        if let Some(client) = &self.redis {
            let mut con = client.get_multiplexed_async_connection().await
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            
            let val: Option<String> = con.get(key).await
                .map_err(|e| napi::Error::from_reason(e.to_string()))?;
            Ok(val)
        } else {
            Err(napi::Error::from_reason("No Redis connected"))
        }
    }

    // Legacy query method wrapper
    #[allow(dead_code)]
    pub async fn query(&self, sql: &str) -> Result<String> {
        self.query_with_params(sql, vec![]).await
    }

    // New parameterized query method
    pub async fn query_with_params(&self, sql: &str, params: Vec<Value>) -> Result<String> {
        match &self.pool {
            DatabasePool::Postgres(pool) => {
                let mut query = sqlx::query(sql);
                for param in params {
                    match param {
                        Value::Null => query = query.bind(None::<String>),
                        Value::Bool(b) => query = query.bind(b),
                        Value::Number(n) => {
                            if let Some(i) = n.as_i64() {
                                query = query.bind(i);
                            } else if let Some(f) = n.as_f64() {
                                query = query.bind(f);
                            } else {
                                query = query.bind(n.to_string());
                            }
                        },
                        Value::String(s) => query = query.bind(s),
                        Value::Array(a) => query = query.bind(serde_json::to_string(&a).unwrap_or_default()),
                        Value::Object(o) => query = query.bind(serde_json::to_string(&o).unwrap_or_default()),
                    }
                }

                let rows = query
                    .fetch_all(pool)
                    .await
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?;
                
                let mut results = Vec::new();
                for row in rows {
                    let mut map = Map::new();
                    for col in row.columns() {
                        let key = col.name().to_string();
                        let type_name = col.type_info().name();
                        
                        let value: Value = match type_name {
                            "BOOL" => {
                                let v: Option<bool> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            },
                            "INT2" | "INT4" => {
                                let v: Option<i32> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            },
                            "INT8" => {
                                let v: Option<i64> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            },
                            "FLOAT4" | "FLOAT8" => {
                                let v: Option<f64> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            },
                            "VARCHAR" | "TEXT" | "BPCHAR" | "NAME" => {
                                let v: Option<String> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            },
                            _ => {
                                // Try as string fallback
                                let v: Option<String> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            }
                        };
                        map.insert(key, value);
                    }
                    results.push(Value::Object(map));
                }
                
                serde_json::to_string(&results).map_err(|e| napi::Error::from_reason(e.to_string()))
            },
            DatabasePool::Sqlite(pool) => {
                 let mut query = sqlx::query(sql);
                 for param in params {
                    match param {
                        Value::Null => query = query.bind(None::<String>),
                        Value::Bool(b) => query = query.bind(b),
                        Value::Number(n) => {
                            if let Some(i) = n.as_i64() {
                                query = query.bind(i);
                            } else if let Some(f) = n.as_f64() {
                                query = query.bind(f);
                            } else {
                                query = query.bind(n.to_string());
                            }
                        },
                        Value::String(s) => query = query.bind(s),
                        Value::Array(a) => query = query.bind(serde_json::to_string(&a).unwrap_or_default()),
                        Value::Object(o) => query = query.bind(serde_json::to_string(&o).unwrap_or_default()),
                    }
                }

                let rows = query
                    .fetch_all(pool)
                    .await
                    .map_err(|e| napi::Error::from_reason(e.to_string()))?;

                let mut results = Vec::new();
                for row in rows {
                    let mut map = Map::new();
                    for col in row.columns() {
                        let key = col.name().to_string();
                        let type_name = col.type_info().name();

                        let value: Value = match type_name {
                            "BOOLEAN" => {
                                let v: Option<bool> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            },
                            "INTEGER" => {
                                let v: Option<i64> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            },
                            "REAL" => {
                                let v: Option<f64> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            },
                            "TEXT" => {
                                let v: Option<String> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            },
                            _ => {
                                // Try as string fallback
                                let v: Option<String> = row.try_get(col.ordinal()).ok();
                                v.map(Value::from).unwrap_or(Value::Null)
                            }
                        };
                        map.insert(key, value);
                    }
                    results.push(Value::Object(map));
                }
                serde_json::to_string(&results).map_err(|e| napi::Error::from_reason(e.to_string()))
            },
            DatabasePool::None => Err(napi::Error::from_reason("No database connected")),
        }
    }

    pub async fn query_with_cache(&self, sql: &str, ttl_sec: Option<u32>) -> Result<String> {
        self.query_with_params_and_cache(sql, vec![], ttl_sec).await
    }

    pub async fn query_with_params_and_cache(&self, sql: &str, params: Vec<Value>, ttl_sec: Option<u32>) -> Result<String> {
        let cache_key = if params.is_empty() {
            sql.to_string()
        } else {
             format!("{}|{:?}", sql, params)
        };

        if let Some(ttl) = ttl_sec {
            if let Some(entry) = self.query_cache.get(&cache_key) {
                if entry.value().1.elapsed() < Duration::from_secs(ttl as u64) {
                    return Ok(entry.value().0.clone());
                }
            }
        }

        let result = self.query_with_params(sql, params).await?;

        if let Some(_) = ttl_sec {
             self.query_cache.insert(cache_key, (result.clone(), Instant::now()));
        }
        
        Ok(result)
    }
}
