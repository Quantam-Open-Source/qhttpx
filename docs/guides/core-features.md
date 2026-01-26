# Core Features: Routing & Middleware

This guide covers the fundamental building blocks of QHTTPX: defining routes, using middleware, and handling requests.

## Routing

Routes are defined using a fluent API style. Every route definition starts with an HTTP method (`get`, `post`, etc.) and **must** end with `.respond()`.

### Basic Route

```typescript
app.get('/')
   .desc('Root endpoint') // Optional description
   .use((ctx, state) => {
       return { message: 'Hello World' };
   })
   .respond();
```

### Path Parameters

Parameters are accessible via `state.params`.

```typescript
app.get('/users/:id')
   .use((ctx, state) => {
       const userId = state.params.id;
       return { id: userId };
   })
   .respond();
```

### Request Body (POST)

Use `ctx.json()` to parse incoming JSON bodies.

```typescript
app.post('/data')
   .use(async (ctx, state) => {
       const body = await ctx.json();
       return { received: body };
   })
   .respond();
```

## Middleware & Policies

QHTTPX supports both Javascript middleware (via `.use()`) and Native Rust policies (via specific methods).

### Rate Limiting (Native)

Apply rate limits efficiently at the native layer.

```typescript
app.get('/limited', (ctx) => {
    return ctx.send({ message: "Request accepted" });
})
.rateLimit({ limit: 5, window: 10 }); // 5 requests per 10 seconds
```

### Caching (Native)

Cache entire responses to bypass handler execution for frequent requests.

```typescript
app.get('/cached', async (ctx) => {
    // Expensive operation...
    return ctx.send({ data: "Expensive Data" });
})
.cache({ ttl: 10 }); // Cache response for 10 seconds
```

### Custom Status Codes

Set the HTTP status code for the response.

```typescript
app.post('/create')
    .use(() => ({ created: true }))
    .status(201)
    .respond();
```

## Context Object (`ctx`)

The `ctx` object provides methods to interact with the request and response.

*   `ctx.json()`: Promise that resolves to the parsed JSON body.
*   `ctx.send(data)`: Sends a JSON response.
*   `ctx.req`: Access to the raw Node.js request object (if needed).
*   `ctx.res`: Access to the raw Node.js response object (if needed).

## State Object (`state`)

The `state` object is used to pass data between middleware steps and contains route parameters.

*   `state.params`: Key-value pairs of path parameters.
*   `state._status`: Internal property for status code (set via `.status()`).

## Application Configuration & Observability

QHTTPX includes built-in tools for environment management and production observability.

### Environment Variables

You can automatically load environment variables from a `.env` file when initializing the app.

```typescript
// .env file
// PORT=3000
// DB_URL=postgres://...

const app = Q.app({ 
    env: true // Automatically loads .env file
});

// Access variables safely
const dbUrl = Q.env('DB_URL', 'postgres://localhost:5432/default');
```

### Logging

Enable structured JSON logging with a single line. This hooks into the high-performance Rust logger.

```typescript
app.enableLogging();

// To see logs, run with: RUST_LOG=info node index.js
```

### Metrics (Prometheus)

Expose a `/metrics` endpoint compatible with Prometheus for monitoring.

```typescript
app.enableMetrics();
// Metrics are now available at http://localhost:3000/metrics
```

## Testing

QHTTPX provides a test client to make integration testing easy.

```typescript
import { Q, createTestClient } from 'qhttpx';

const app = Q.app();
app.get('/test', () => ({ ok: true })).respond();

// Create a client wrapping your app
const client = createTestClient(app);

// Start client (starts server on random port)
await client.start();

// Make requests
const res = await client.get('/test');
console.log(await res.json()); // { ok: true }

// Cleanup
await client.stop();
```

## 📚 Learn More

Check out the runnable examples for more details:
*   [**Simple Server**](../../examples/simple_server.ts) - Basic routing setup.
*   [**Middleware Demo**](../../examples/middleware_demo.ts) - Advanced middleware usage.
*   [**Observability Demo**](../../examples/observability_demo.ts) - Logging and metrics in action.
