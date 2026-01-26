# QHTTPX Architectural Blueprint

**Version**: 0.1.0-draft
**Date**: 2026-01-23
**Status**: Proposed

---

## 1. Core Philosophy

QHTTPX is built on the premise that the future of software engineering involves a collaboration between human "vibe coders" and AI agents. The framework must be optimized for this duality: expressive and concise for humans, structured and predictable for AIs.

### Design Principles
-   **AI-First Semantics**: API methods map directly to natural language intent. No ambiguous configuration objects.
-   **Zero-Overhead Abstraction**: Abstractions exist only to reduce cognitive load, not to add runtime layers.
-   **Mechanical Sympathy**: The framework respects the hardware (CPU caches, memory allocators, branch prediction) while hiding this complexity from the user.
-   **Opinionated yet Flexible**: We provide the "Golden Path" by default (e.g., JSON serialization, security headers) but allow "ejection" to raw primitives.

---

## 2. Runtime & Language Strategy

### Decision: Hybrid Node.js + Rust Core (N-API)

We will use **Node.js** as the primary user-facing runtime, augmented by a **Rust Core** via N-API (using `napi-rs`).

**Justification:**
-   **Ecosystem**: Node.js has the largest library of packages. Bun and Deno are promising but lack the absolute stability of Node for "Amazon-scale" workloads.
-   **Performance**: Pure JS is fast, but Rust is faster for hot paths (HTTP parsing, routing, serialization).
-   **Distribution**: N-API allows us to ship precompiled binaries (`.node` files) for all major platforms. Users just `npm install qhttpx` and it works without a Rust toolchain.

### Implementation Details
-   **Language**: Source code in **TypeScript** (User-facing) and **Rust** (Core).
-   **Build System**: `tsup` for bundling JS/TS, `cargo` + `napi-rs` for the native extension.
-   **JIT vs AOT**: The Rust core is AOT compiled. The User code is JIT compiled by V8. This gives us the best of both worlds: static analysis for the framework, dynamic flexibility for the app logic.
-   **AI Types**: We will export deep TypeScript definitions that include TSDoc comments explaining *intent* (e.g., `@description "Use this for idempotent read operations"`), which helps Copilot/Cursor suggest the right methods.

---

## 3. Ultra-Fast HTTP Engine

The HTTP engine is the heart of the system. It will be implemented primarily in Rust to avoid V8 garbage collection pauses during request ingestion.

### Components
1.  **Request Parser**: Built on `hyper` (Rust), widely considered the gold standard for HTTP correctness and performance.
2.  **Zero-Copy Parsing**:
    -   Incoming TCP buffers remain in Rust-managed memory.
    -   Headers are parsed using SIMD-accelerated parsers.
    -   We only allocate JS objects (Strings/Buffers) when the user *accesses* a specific field. Lazy evaluation is key.
3.  **JSON Strategy**:
    -   Use `simd-json` (Rust) for parsing large payloads.
    -   For small payloads, V8's `JSON.parse` is competitive, so we will adaptively choose based on payload size.
4.  **Routing**:
    -   **Algorithm**: Radix Tree (Compact Prefix Tree) implemented in Rust.
    -   **Lookups**: The router runs in native code. It returns a numeric ID for the handler, which is then executed in JS. This avoids creating JS string garbage during route matching.
5.  **Middleware Pipeline**:
    -   Linear execution chain (no recursion).
    -   "Onion model" is supported but optimized to avoid deep stack traces.

---

## 4. Environment Auto-Configuration

A "Zero-Config" system that treats environment variables as first-class citizens.

### Features
-   **Auto-Load**: Automatically detects `.env`, `.env.local`, `.env.production`.
-   **Schema Validation**: Define expected env vars in code; the app refuses to boot if they are missing or invalid.
-   **Type-Safe Injection**:
    ```typescript
    // In code
    const dbUrl = ctx.env.DATABASE_URL; // Typed as string, verified at boot
    ```
-   **AI-Readability**: Variables are exposed in a flat, predictable structure that LLMs can easily infer context from.

---

## 5. Database Layer: AI-Native ORM

A fluent, chainable query builder that optimizes itself.

### Architecture
-   **Connection Pooling**: Implemented in Rust (via `sqlx` logic or similar) to handle "Adaptive Pooling".
    -   **CPU-Aware**: If CPU usage is high, reduce pool size to prevent thrashing.
    -   **Memory-Aware**: If memory is tight, aggressively close idle connections.
-   **Transparent Caching**:
    -   **Prepared Statements**: Cached by default.
    -   **Query Plans**: The ORM remembers the "shape" of queries and reuses execution plans.
-   **AI-Friendly DSL**:
    ```typescript
    await db.users.find()
        .where(u => u.country.eq("ZW"))
        .optimize() // Hints the DB engine to analyze indices
        .exec();
    ```

---

## 6. Memory Optimization

**Goal**: Zero GC spikes.

-   **Object Pooling**: Reusable context objects (`Ctx`) are allocated in a pool. When a request finishes, the `Ctx` is scrubbed and returned to the pool instead of being garbage collected.
-   **Arena Allocators**: For complex request lifecycles, use a linear memory arena in Rust for temporary data, freed all at once at the end of the request.
-   **Zero-Copy Streams**: Pipe file system reads directly to the socket (using `sendfile` syscalls where possible via Rust) bypassing V8 memory entirely.

---

## 7. Response Optimization

-   **Auto-Minification**: JSON responses are minified (whitespace removed) by default in production.
-   **Compression**: Adaptive selection of Brotli (for text) or Zstd (for internal services) based on `Accept-Encoding`.
-   **Smart Headers**:
    -   `ETag` generated automatically via xxHash of the body.
    -   `Cache-Control` heuristics applied based on route type (static vs dynamic).
-   **HTTP/3**: Enabled by default via `quinn` (Rust) when using the secure server.

---

## 8. Fluent API (The "Vibe Coder" Experience)

The API is designed to be written left-to-right, top-to-bottom, minimizing cursor movement and cognitive load.

```typescript
app.get("/api/data")
  .desc("Fetches core data")
  .auth("jwt")          // Middleware reference by name
  .guard(ctx => ctx.user.isAdmin) // Inline logic
  .query(q => q.string("id"))     // Validation
  .respond(ctx => {
      return { id: ctx.query.id, status: "ok" };
  });
```

**Rules**:
-   **No Decorators**: They are hard to type-check and hide control flow.
-   **No Classes**: Functions and closures are more memory efficient and easier for AIs to generate correctly.
-   **Chainable**: Everything returns `this` or a new builder context.

---

## 9. AI-Native Documentation System

Documentation is treated as a dataset for LLMs.

-   **Structure**: Every doc page has a standardized JSON-LD schema describing the API.
-   **Embeddings**: We ship a `docs.jsonl` file optimized for RAG (Retrieval Augmented Generation).
-   **Format**:
    -   **Intent**: "Why use this?"
    -   **Signature**: TypeScript definition.
    -   **Constraints**: "Don't use X with Y".
    -   **Example**: Minimal, copy-pasteable code.

---

## 10. File & Package Structure

```text
qhttpx/
  ├─ core/          # Rust N-API crate (the engine)
  ├─ runtime/       # Node.js entry points and bindings
  ├─ net/           # Low-level networking (TCP/QUIC)
  ├─ http/          # HTTP/1.1, H2, H3 implementations
  ├─ router/        # Radix tree logic
  ├─ ctx/           # Context object pooling and definitions
  ├─ env/           # Environment variable parser
  ├─ db/            # ORM and Query Builder
  ├─ ai/            # AI analysis tools and RAG generators
  ├─ perf/          # Internal performance monitoring
  ├─ bench/         # CI/CD benchmarks
  ├─ compiler/      # JIT optimization logic (future)
  ├─ types/         # Pure TypeScript definitions
  └─ fluent/        # The high-level API sugar
```

---

## 11. Performance Target

-   **Benchmark**: TechEmpower "Plaintext" and "JSON" tracks.
-   **Goal**: Top 5 in the JavaScript category, competing with `uWebSockets.js`.
-   **Metrics**:
    -   **Throughput**: 20k+ req/sec (single core, 4GB RAM).
    -   **Latency**: p99 < 2ms.
    -   **Memory**: Fixed overhead < 50MB.

---

## 12. AI Evaluation Mode (`qhttpx analyze`)

A CLI tool that acts as a code doctor.

```bash
$ qhttpx analyze ./src
```

**Output**:
-   **Routing Cost**: "Your regex route at /api/v1/* is slowing down dispatch by 15%."
-   **Allocation Hotspots**: "Handler at line 45 creates 500 unnecessary objects per request."
-   **AI-Readability**: "Variable `x` at line 10 is ambiguous. Rename to `userId` for better Copilot accuracy."

---

## 13. Packaging

-   **npm**: `npm install qhttpx` (downloads platform-specific binary via `optionalDependencies`).
-   **Single Binary**: A bundler (like `pkg` or `deno compile` equivalent) can wrap the Node runtime + QHTTPX into a standalone executable for deployment.

---

## 14. Roadmap to v1

1.  **Phase 1: The Engine (v0.1)** - Rust Core, Basic HTTP, Hello World.
2.  **Phase 2: The Experience (v0.5)** - Fluent API, Router, Context Pooling.
3.  **Phase 3: The Ecosystem (v0.8)** - DB Layer, Env, Validation.
4.  **Phase 4: AI Native (v1.0)** - `analyze` command, RAG docs, stable release.
