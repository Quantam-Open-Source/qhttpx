
import { Q } from '../src';

const app = Q.app();

// 1. Native Query Caching
// SQL executed in Rust, result cached in Rust memory (DashMap)
// Second request returns instantly without DB roundtrip!
app.get('/users/cached')
   .use(async (ctx) => {
       try {
           // Query with 60 second TTL
           const json = await app.db.query("SELECT * FROM users", 60);
           return JSON.parse(json);
       } catch (e: any) {
           return { error: e.message };
       }
   })
   .respond();

// 2. Native MongoDB Support
// Query executed in Rust via mongodb crate
// BSON -> JSON conversion happens in Rust
app.get('/logs')
   .use(async (ctx) => {
       try {
           const logs = await app.db.mongo("my_db", "logs").find({ 
               level: "error",
               timestamp: { $gt: 1700000000 }
           });
           return logs;
       } catch (e: any) {
           return { error: e.message };
       }
   })
   .respond();

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    
    // Connect Databases (Async)
    // app.db.connectPostgres("postgres://...");
    // app.db.connectMongo("mongodb://localhost:27017");
});
