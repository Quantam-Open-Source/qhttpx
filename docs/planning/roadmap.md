# 🗺️ QHTTPX Technical Roadmap

This roadmap outlines the verified implementation status of the QHTTPX framework, structured by architectural layer. It reflects the "creation story" of the framework, from the low-level Rust engine up to the high-level developer tooling.

## �️ Phase 1: The Iron Foundation (Core Runtime)
*Status: Production-Grade | Implemented in `core/src`*

The bedrock of QHTTPX is a high-performance, memory-safe execution environment built on Rust.

### Core Networking
- [x] **Hyper 1.x Integration**: Built on top of Hyper's modern, asynchronous HTTP implementation.
- [x] **Tokio Runtime**: Fully non-blocking I/O using the Tokio reactor.
- [x] **Hybrid Architecture**: Zero-copy N-API bridge (`napi-rs`) between Node.js and Rust.
- [x] **Native WebSocket Support**: Real-time bidirectional communication powered by `tokio-tungstenite`.
    - Support for Rooms and Peer messaging.
    - Native upgrade handling.
- [x] **TLS/SSL Termination**: Built-in secure connection handling via `tokio-rustls`.
- [x] **HTTP Compression**: Automatic Gzip and Brotli compression via `async-compression`.

### Performance Primitives
- [x] **Zero-Copy Buffer Management**: Efficient `Bytes` and `BoxBody` handling to minimize memory overhead.
- [x] **In-Memory Caching**: High-concurrency `DashMap` storage for sub-millisecond data retrieval.
- [x] **Distributed Rate Limiting**: Redis-backed `TrafficGovernor` for cluster-wide traffic control.
- [x] **Global CORS**: Configurable Cross-Origin Resource Sharing policies handled at the network layer.

---

## 🛡️ Phase 2: Data & Security Layer
*Status: Hardened | Implemented in `core/src/database.rs` & `lib.rs`*

Security and data integrity are enforced natively before requests ever reach the JavaScript runtime.

### Data Access
- [x] **Polyglot Database Support**:
    - **PostgreSQL**: Native async driver via `sqlx`.
    - **SQLite**: Embedded high-performance database via `sqlx`.
    - **MongoDB**: Document store support via `mongodb`.
    - **Redis**: Key-value store for caching and rate limiting.
- [x] **Parameterized Query Engine**: Protection against SQL Injection using native bind parameters (`$1`, `?`).
- [x] **Connection Pooling**: Automatic management of database connections via `DatabaseManager`.

### Security Guardrails
- [x] **Native JWT Verification**: Token validation performed in Rust (`jsonwebtoken`) for zero-latency auth checks.
- [x] **Schema Validation**: High-performance JSON Schema validation (`jsonschema`) compiled and cached in Rust.
- [x] **Secure Uploads**: Streaming multipart file uploads handled via `multer` in Rust.

---

## 👩‍💻 Phase 3: The Developer Experience (Application Layer)
*Status: Intuitive | Implemented in `src/fluent.ts` & `src/index.ts`*

The user-facing API designed for joy, productivity, and type safety.

### Fluent API
- [x] **Chainable Interface**: Builder pattern for route definition (`.get().status().json()`).
- [x] **Type-Safe Context**: Strongly typed `RequestContext` with inferred params and body.
- [x] **Middleware Composition**: Easy logic reuse via `.use((ctx) => ...)` mechanism.
- [x] **Declarative Features**:
    - `.cache({ ttl: 60 })`: Define caching rules inline.
    - `.rateLimit({ limit: 100 })`: Define throttle rules inline.
    - `.auth('jwt')`: Attach security policies declaratively.
    - `.slo(200)`: Set Service Level Objectives for routes.

### Validation & Logic
- [x] **Inline Validation**: `.validate({ email: 'email', age: 'int' })` helper.
- [x] **Response Shaping**: Declarative status codes and response schemas.
- [x] **Query Builders**: Helper methods for constructing database queries securely.

---

## �️ Phase 4: Operational Excellence (Tooling)
*Status: Robust | Implemented in `src/cli.ts` & `core/src/server.rs`*

Tools for building, deploying, and monitoring QHTTPX applications.

### CLI & Migrations
- [x] **QHTTPX CLI**: Unified command-line interface (`qhttpx`).
- [x] **Migration System**:
    - `migrate up` / `migrate down` commands.
    - Support for `.sql` migration files.
    - Migration tracking table (`_qhttpx_migrations`).
- [x] **Environment Management**: Native `.env` file loading and parsing.

### Observability
- [x] **Prometheus Metrics**: Built-in atomic counters for:
    - `http_requests_total`
    - `http_active_connections`
    - `http_requests_errors_total`
    - `http_request_duration_ms_avg`
- [x] **Structured Logging**: JSON-formatted logs via `tracing` for easy ingestion by log aggregators.
- [x] **Graceful Shutdown**: Signal handling to ensure clean connection termination.

---

## 🚀 Phase 5: Future Scale (Upcoming)
*Status: Planned*

- [ ] **Cluster Mode**: Native Node.js cluster support for vertical scaling.
- [ ] **OpenAPI Generation**: Auto-generating Swagger docs from Fluent API definitions.
- [ ] **GraphQL Support**: Native integration for GraphQL execution.
- [ ] **Edge Runtime Support**: Compatibility with WinterCG standards.
