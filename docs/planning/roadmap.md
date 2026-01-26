# qhttpx Roadmap: Path to v1.0

This document outlines the strategic roadmap for the `qhttpx` HTTP runtime, focusing on achieving deployment readiness, security, and a world-class "AI-Native" Developer Experience.

## 🛑 Critical Priority: Security & Core Foundation
**Status: � Completed**

The current implementation relies on string interpolation for SQL queries, which is vulnerable to SQL Injection. This must be resolved before any production usage.

- [x] **Core: Parameterized Query Support**
    - Modify Rust `DatabaseManager::query` to accept parameters (`Vec<Value>`).
    - Expose `query_with_params(sql, params)` via N-API to Node.js.
    - Support both Postgres (`$1`) and SQLite (`?`) parameter syntaxes.
- [x] **Fluent: Secure Query Generation**
    - Rewrite `fluent.ts` to generate SQL with placeholders instead of injecting values.
    - Remove all `replace(/'/g, "''")` manual escaping.
- [x] **Type Safety**
    - Remove `// @ts-ignore` usages in `fluent.ts` and controllers.
    - Define proper `DatabaseContext` interface with generic return types.

## 🚀 Phase 2: Fluent API Maturity
**Status: � Completed**

Expand the Fluent API to cover standard CRUD operations and common web patterns, reducing the need for "escape hatches" to raw code.

- [x] **Complete CRUD**
    - `update(table, { where, data })`: Secure update with whitelist.
    - `delete(table, { where })`: Secure delete.
    - `softDelete(table)`: Toggle a `deleted_at` timestamp instead of removing rows.
- [x] **Data Access Enhancements**
    - `paginate({ page, limit })`: Auto-append `LIMIT/OFFSET` and return metadata.
    - `sort(field, direction)`: Safe `ORDER BY` generation.
    - `select(fields[])`: Whitelist columns to return (security).
- [x] **Logic & Control Flow**
    - `hook('before', fn)`: Run logic before the main DB operation (e.g., set `updated_at`).
    - `hook('after', fn)`: Run logic after (e.g., trigger email).
    - `iff(condition, fn)`: Conditional execution chain.

## 🧠 Phase 3: AI-Native & Auto-SQL
**Status: ✅ Completed**

Features designed to make `qhttpx` the best runtime for AI agents to write code for.

- [x] **Auto-SQL Middleware**
    - Automatically map URL query parameters (e.g., `?status=active&sort=created_desc`) to safe SQL clauses.
    - Eliminate boilerplate for standard filtering/sorting.
- [x] **Deterministic Context**
    - Ensure `ctx` object passed to handlers is strictly typed and serializable.
    - Provide "Context Snapshots" for AI debugging.
- [x] **Self-Documenting Routes**
    - `flow()` chains should auto-generate OpenAPI/Swagger specs without extra decorators.
    - Runtime validation of inputs against generated specs.

## 🛡️ Phase 4: Production Readiness
**Status: ✅ Completed**

- [x] **Observability**
    - Structured JSON logging.
    - Prometheus metrics endpoint (Request duration, DB latency, Error rates).
- [x] **Resilience**
    - Global Error Boundary (catch all unhandled exceptions).
    - Graceful Shutdown (drain connections properly).
- [x] **Migrations**
    - Simple CLI tool for running SQL migrations (`up`/`down`).

---

## 📝 Implementation Notes

### Security Standard
All database operations MUST use the following pattern in the Core:
```rust
// Core (Rust)
pub async fn query(&self, sql: String, params: Vec<serde_json::Value>) -> Result<String>
```

And in the Fluent Layer (TS):
```typescript
// Fluent (TS)
const sql = "SELECT * FROM users WHERE id = $1";
const params = [userId];
await ctx.db.query(sql, params);
```

### Auto-SQL Concept
Instead of writing:
```typescript
app.get('/users', async (c) => {
   const sql = `SELECT * FROM users WHERE age > ${c.query.age}`; // BAD
   // ...
});
```

We enable:
```typescript
app.flow('GET', '/users')
   .autoFilter('users', ['age', 'status']) // Automatically maps query params safely
   .respond();
```
