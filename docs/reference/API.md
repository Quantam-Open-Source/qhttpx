# QHTTPX API Reference

## Table of Contents

- [Application](#application)
- [Routing](#routing)
- [Database](#database)
- [Authentication](#authentication)
- [Observability](#observability)

---

## Application

### `Q.app(options?)`

Creates a new QHTTPX application instance.

**Options:**

```typescript
interface AppOptions {
    // Database configurations
    db?: {
        postgres?: string; // Connection string
        sqlite?: string;   // File path
        mongo?: string;    // Connection string
        redis?: string;    // Connection string
    };
    
    // Authentication configuration
    auth?: {
        jwtSecret?: string; // Secret key for JWT verification
    };
}
```

**Example:**

```typescript
const app = Q.app({
    db: { postgres: process.env.DATABASE_URL },
    auth: { jwtSecret: process.env.JWT_SECRET }
});
```

### `app.listen(port, callback?)`

Starts the server on the specified port.

---

## Routing

### `app.get(path, options?, handler?)`
### `app.post(path, options?, handler?)`
### `app.put(path, options?, handler?)`
### `app.delete(path, options?, handler?)`
### `app.patch(path, options?, handler?)`

Define routes with optional configuration.

**Options:**

```typescript
interface RouteOptions {
    // Static JSON response (Zero-Copy)
    json?: any;
    
    // Enable JWT authentication for this route
    auth?: boolean;
    
    // Rate limiting configuration
    rateLimit?: {
        limit: number;
        window: number; // in seconds
        distributed?: boolean; // Use Redis?
    };
}
```

**Handler:**

```typescript
(req: Request, res: Response) => Promise<any> | any
```

**Example:**

```typescript
app.post('/users', { auth: true }, async (req) => {
    const user = req.body;
    await app.db.query('INSERT INTO users ...', [user.name]);
    return { success: true };
});
```

---

## Database

Access the native database client via `app.db`.

### `app.db.query(sql, params?)`

Executes a SQL query (Postgres or SQLite).

- **sql**: The SQL query string.
- **params**: Array of parameters (optional).
- **Returns**: Promise resolving to an array of rows.

```typescript
const rows = await app.db.query('SELECT * FROM users WHERE id = $1', [1]);
```

### `app.db.execute(sql, params?)`

Executes a SQL statement (INSERT, UPDATE, DELETE).

- **Returns**: Promise resolving to the number of affected rows.

### `app.db.redis.get(key)`
### `app.db.redis.set(key, value, ttl?)`
### `app.db.redis.del(key)`

Native Redis operations.

```typescript
await app.db.redis.set('session:123', 'data', 3600); // 1 hour TTL
const session = await app.db.redis.get('session:123');
```

---

## Authentication

### `app.auth.verifyToken(token)`

Manually verify a JWT token using the native Rust verifier.

- **token**: The JWT string.
- **Returns**: The decoded payload or throws an error.

Note: If you use `{ auth: true }` in route options, this is handled automatically.

---

## Observability

### `app.enableLogging()`

Enables structured JSON logging for all requests. Logs include method, path, latency, status code, and request ID.

### `app.enableMetrics()`

Exposes a Prometheus-compatible metrics endpoint at `/metrics`.

**Metrics Provided:**
- `http_requests_total`: Total number of requests.
- `http_active_connections`: Currently active connections.
- `http_errors_total`: Total number of 5xx errors.
- `http_latency_ms`: Request latency histogram.
