# QHTTPX

[![Website](https://img.shields.io/badge/website-qhttpx.gridrr.com-blue?style=flat&logo=google-chrome&logoColor=white)](https://qhttpx.gridrr.com)
[![npm version](https://img.shields.io/npm/v/qhttpx.svg?style=flat)](https://www.npmjs.com/package/qhttpx)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Downloads](https://img.shields.io/npm/dm/qhttpx.svg)](https://www.npmjs.com/package/qhttpx)
[![GitHub stars](https://img.shields.io/github/stars/Quantam-Open-Source/QHTTPX.svg?style=social)](https://github.com/Quantam-Open-Source/QHTTPX)

**The AI-Native High-Performance Web Engine**

QHTTPX is a next-generation web framework that combines the **developer experience of Node.js** with the **raw performance of Rust**. It is designed for high-load applications, AI agents, and distributed systems where latency and throughput are critical.

## 🚀 Why QHTTPX?

- **Native Rust Core**: The heavy lifting (HTTP parsing, routing, JWT verification, DB drivers) happens in Rust. Node.js is just the orchestration layer.
- **Zero-Copy Architecture**: Data flows directly from the network to the database/response with minimal V8 overhead.
- **Developer Delight**: A fluent, declarative API that feels like home for Express/Fastify users.
- **Battery-Included**: Database, Auth, Rate Limiting, and Observability are built-in, not bolted on.

## 📊 Benchmarks

QHTTPX significantly outperforms traditional Node.js frameworks in high-throughput scenarios.

**Environment**: Windows, 2 vCPU, 8GB RAM

### Throughput (Requests/Sec)

| Framework | Req/Sec | Multiplier |
| :--- | :--- | :--- |
| **Express** | 9,094 | 1.0x (Baseline) |
| **Koa** | 11,381 | 1.25x |
| **Fastify** | 12,265 | 1.35x |
| **QHTTPX** | **45,136** | **4.96x** |

### Latency (Average)

| Framework | Latency |
| :--- | :--- |
| **Express** | 639.72 ms |
| **Koa** | 504.44 ms |
| **Fastify** | 454.32 ms |
| **QHTTPX** | **268.09 ms** |

### Extreme Load Stability (C10K)

We simulated **10,000 concurrent connections** to test resilience.

| Framework | Status | Total Requests Served | Notes |
| :--- | :--- | :--- | :--- |
| **Express** | ❌ FAILED | 0 | 100% Timeout / Errors |
| **Koa** | ❌ FAILED | 0 | 100% Timeout / Errors |
| **Fastify** | ❌ FAILED | 0 | 100% Timeout / Errors |
| **QHTTPX** | **✅ PASS** | **147,930** | **Zero crashes**, 200ms latency |

> *See full benchmark details in [docs/benchmarks.md](./docs/benchmarks.md)*

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

Apache-2.0
