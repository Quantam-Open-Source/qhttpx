# QHTTPX Core (Rust)

This directory contains the native Rust implementation of the QHTTPX engine.

## Responsibilities

1.  **HTTP/1.1 & HTTP/3 Parsing**: Utilizing `hyper` and `quinn`.
2.  **Routing**: Radix tree implementation for URL matching.
3.  **Memory Management**: Arena allocation for request contexts.
4.  **N-API Bindings**: Exposing high-performance methods to Node.js.

## Interface

The core exposes a `NativeEngine` class to TypeScript:

```rust
// pseudo-rust
struct NativeEngine {
    router: RadixRouter,
    pool: ConnectionPool,
}

impl NativeEngine {
    fn dispatch(&self, req: Request) -> Response {
        // Zero-copy dispatch logic
    }
}
```
