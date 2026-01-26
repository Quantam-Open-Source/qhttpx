# Databases & Authentication

QHTTPX leverages Rust's performance for database operations and authentication, offering significant speed advantages over traditional Node.js drivers.

## Native Database Support

The framework includes native drivers for PostgreSQL and MongoDB, allowing you to execute queries directly from the Rust core.

### Configuration

Database connections are typically configured after starting the server.

```typescript
app.listen(3000, () => {
    // Connect to Postgres
    app.db.connectPostgres("postgres://user:pass@localhost:5432/mydb")
        .catch(console.error);
    
    // Connect to MongoDB
    app.db.connectMongo("mongodb://localhost:27017")
        .catch(console.error);
});
```

### PostgreSQL

Execute raw SQL queries with zero serialization overhead in Node.js.

```typescript
app.get('/users', async (c) => {
    try {
        // Result is returned as a pre-serialized JSON string from Rust
        const result = await app.db.query("SELECT * FROM users");
        return c.send(JSON.parse(result));
    } catch (e: any) {
        return c.send({ error: e.message });
    }
});
```

#### Caching Queries
You can cache query results in the Rust layer (using DashMap) for instant retrieval.

```typescript
// Cache result for 60 seconds
const json = await app.db.query("SELECT * FROM users", 60);
```

### MongoDB

Perform MongoDB operations with BSON -> JSON conversion handled in Rust.

```typescript
app.get('/logs', async (c) => {
    try {
        // db.mongo(database, collection).find(query)
        const logs = await app.db.mongo("my_db", "logs").find({ 
            level: "error",
            timestamp: { $gt: 1700000000 }
        });
        return c.send(logs);
    } catch (e: any) {
        return c.send({ error: e.message });
    }
});
```

## Native Authentication (JWT)

QHTTPX can handle JWT verification in the Rust layer, preventing invalid requests from ever reaching your Node.js code.

### Setup

Set the JWT secret after initialization.

```typescript
const SECRET = 'super-secret-key';

app.listen(3000, () => {
    app.auth.setJwtSecret(SECRET);
});
```

### Protecting Routes

Use the `.jwt()` middleware in your route chain.

```typescript
app.get('/protected', (c) => {
    // This handler only runs if the JWT is valid
    return c.send({ message: "You have valid Native JWT!" });
})
.jwt(); // Enable Native JWT Policy
```

If the token is missing or invalid, the Rust core will return a `401 Unauthorized` response immediately.

## 📚 Learn More

Check out the runnable examples for more details:
*   [**Postgres Demo**](../../examples/postgres_demo.ts) - SQL queries with caching.
*   [**Mongo Demo**](../../examples/mongo_demo.ts) - MongoDB CRUD operations.
*   [**Auth Demo**](../../examples/auth_demo.ts) - Native JWT authentication.
