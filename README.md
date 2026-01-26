# QHTTPX

**The AI-Native High-Performance Web Engine**

QHTTPX is a next-generation web framework that combines the **developer experience of Node.js** with the **raw performance of Rust**. It is designed for high-load applications, AI agents, and distributed systems where latency and throughput are critical.

## 🚀 Why QHTTPX?

- **Native Rust Core**: The heavy lifting (HTTP parsing, routing, JWT verification, DB drivers) happens in Rust. Node.js is just the orchestration layer.
- **Zero-Copy Architecture**: Data flows directly from the network to the database/response with minimal V8 overhead.
- **Developer Delight**: A fluent, declarative API that feels like home for Express/Fastify users.
- **Battery-Included**: Database, Auth, Rate Limiting, and Observability are built-in, not bolted on.

## 📊 Benchmarks

QHTTPX significantly outperforms traditional Node.js frameworks in high-throughput scenarios.

**Environment**: Windows, 2 vCPU, 4GB RAM

| Framework | Requests/Sec | Total Requests (10s) | Relative Performance |
|-----------|--------------|----------------------|----------------------|
| **QHTTPX**| **~28,624**  | **257,620**          | **4.64x**            |
| Fastify   | ~9,965       | 99,640               | 1.62x                |
| Koa       | ~8,923       | 89,230               | 1.45x                |
| Express   | ~6,164       | 61,640               | 1.0x (Baseline)      |

*Benchmark run on standard hardware (100 connections, 10 pipelining). Note: Fastify performance without schema optimization is comparable to Express.*

## 📦 Installation

```bash
npm install qhttpx
```

## ⚡ Quick Start

```typescript
import { Q } from 'qhttpx';

const app = Q.app();

// Standard Route
app.get('/', (req, res) => {
    return { hello: 'world' };
});

// Zero-Copy Static JSON (Fastest)
app.get('/static', {
    json: { status: 'ok', data: [1, 2, 3] }
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
```

## 🛠 Key Features

### 1. Universal Database Client
Connect to Postgres, MongoDB, SQLite, or Redis without installing extra drivers. The connection pool is managed natively in Rust.

```typescript
// Configure connection
const app = Q.app({
    db: {
        postgres: 'postgres://user:pass@localhost:5432/db',
        redis: 'redis://localhost:6379'
    }
});

app.get('/users', async (req) => {
    // Zero-copy SQL execution
    const users = await app.db.query('SELECT * FROM users WHERE active = $1', [true]);
    return users;
});

app.get('/cache', async (req) => {
    // Native Redis access
    await app.db.redis.set('key', 'value');
    const val = await app.db.redis.get('key');
    return { val };
});
```

### 2. Built-in Authentication
JWT verification happens in the Rust layer before the request even reaches Node.js.

```typescript
// Enable JWT Middleware
const app = Q.app({
    auth: {
        jwtSecret: 'super-secret-key'
    }
});

// Protected Route
app.get('/profile', { auth: true }, (req) => {
    // req.user is already populated if valid
    return { user: req.user };
});
```

### 3. Distributed Rate Limiting
Cluster-ready rate limiting powered by Redis (or in-memory fallback).

```typescript
app.get('/api', {
    rateLimit: {
        limit: 100,
        window: 60, // 1 minute
        distributed: true // Syncs across all instances via Redis
    }
}, handler);
```

### 4. Production Observability
Prometheus metrics and structured logging are enabled by default.

```typescript
const app = Q.app();
app.enableLogging(); // Structured JSON logs
app.enableMetrics(); // Exposes /metrics endpoint for Prometheus

// Metrics available at http://localhost:3000/metrics
```

## 🐳 Deployment

Deploy easily with our optimized multi-stage Dockerfile.

```dockerfile
# Dockerfile is included in the root
docker build -t my-app .
docker run -p 3000:3000 my-app
```

## License

MIT
