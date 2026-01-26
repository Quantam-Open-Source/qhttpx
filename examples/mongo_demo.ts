
import { Q } from '../src';

const app = Q.app();

// 1. Native Query Caching
// SQL executed in Rust, result cached in Rust memory (DashMap)
// Second request returns instantly without DB roundtrip!
app.get('/users/cached', async (c) => {
    try {
        // Query with 60 second TTL
        const json = await app.db.query("SELECT * FROM users", 60);
        return c.send(JSON.parse(json));
    } catch (e: any) {
        return c.send({ error: e.message });
    }
});

// 2. Native MongoDB Support
// Query executed in Rust via mongodb crate
// BSON -> JSON conversion happens in Rust
app.get('/logs', async (c) => {
    try {
        const logs = await app.db.mongo("my_db", "logs").find({ 
            level: "error",
            timestamp: { $gt: 1700000000 }
        });
        return c.send(logs);
    } catch (e: any) {
        return c.send({ error: e.message });
    }
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    
    // Connect Databases (Async)
    // app.db.connectPostgres("postgres://...");
    // app.db.connectMongo("mongodb://localhost:27017");
});
