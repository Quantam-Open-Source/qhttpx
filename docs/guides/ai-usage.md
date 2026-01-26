# AI Coding Agent Guide for QHTTPX

This guide is designed to help AI coding agents (like yourself) generate high-quality, idiomatic code using the `qhttpx` framework.

## 1. Framework Overview

`qhttpx` is a Developer Experience (DX) focused HTTP framework for Node.js (and compatible runtimes). It emphasizes:
- **Fluent API**: Chained method calls for route definition.
- **Type Safety**: Built-in TypeScript support.
- **Simplicity**: Minimal boilerplate.

## 2. Basic Scaffolding

When asked to create a new `qhttpx` application, use the following pattern:

```typescript
import { Q } from 'qhttpx'; // Adjust import based on project structure (e.g., '../src')

const app = Q.app();
const PORT = 3000;

// Middleware (optional)
// app.use(...)

// Routes
app.get('/')
    .use((ctx) => ({ message: 'Hello from QHTTPX!' }))
    .respond();

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
```

## 3. Routing Patterns

Routes are defined using the `app.<method>(path)` pattern, followed by a chain of operations. **ALWAYS** end a route definition with `.respond()`.

### GET Request
```typescript
app.get('/users')
    .use(async (ctx) => {
        const users = await db.findAll();
        return users; // Automatically serialized to JSON
    })
    .respond();
```

### POST Request with Body
Use `ctx.json()` to parse the request body.

```typescript
app.post('/users')
    .use(async (ctx) => {
        const body = await ctx.json();
        // validate body...
        return { status: 'created', user: body };
    })
    .status(201) // Set custom status code
    .respond();
```

### Path Parameters
Access path parameters via `state.params` in the `.use()` callback.

```typescript
app.get('/users/:id')
    .use((ctx, state) => {
        const userId = state.params.id;
        return { id: userId, name: 'John Doe' };
    })
    .respond();
```

## 4. Fluent API Methods

The route builder supports several chainable methods. Use them in this order for clarity:

1.  `.desc('Description')` - Documentation.
2.  `.auth('strategy')` - Authentication requirement.
3.  `.schema({...})` - Input/Output validation (if available).
4.  `.use((ctx, state) => ...)` - Business logic. Can be chained multiple times.
5.  `.status(code)` - Response status code.
6.  `.respond()` - **REQUIRED** terminal method.

## 5. Validation (Schema)

Use `Q.schema`, `Q.string()`, `Q.int()` etc. for validation definitions.

```typescript
const UserSchema = Q.schema({
    username: Q.string().min(3),
    age: Q.int().min(18),
    email: Q.email()
});

// Usage in routes (conceptually)
// app.post('/users').schema(UserSchema)...
```

## 6. Best Practices for AI Generation

-   **Always** import `Q` from the correct location.
-   **Always** chain `.respond()` at the end of a route.
-   **Prefer** returning objects directly from `.use()` for JSON responses.
-   **Use** `async/await` for asynchronous operations within `.use()`.
-   **Comment** complex logic within the fluent chain.

## 7. Common Pitfalls to Avoid

-   ❌ Forgetting `.respond()`: The route will be registered but might hang or not behave as expected.
-   ❌ Accessing `req`/`res` directly: Prefer using `ctx` methods unless absolutely necessary.
-   ❌ Deeply nested callbacks: Use the fluent chain `.use().use()` to break down logic instead of one giant function.
