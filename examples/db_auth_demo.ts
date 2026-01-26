
import { Q } from '../src';
import jsonwebtoken from 'jsonwebtoken';

const app = Q.app();
const SECRET = 'native-super-secret-key-123';

// 1. Configure Native JWT
// This tells the Rust core to use this secret for verification
// Note: We need to wait for server start to set this, but for demo we can lazy init or set in callback
// For now, let's wrap in listen callback or use a dedicated init phase if we had one.
// Actually, our API design in index.ts throws if engine not started.
// So we must call this AFTER listen is called, but that's a race condition for first requests.
// Better approach: Listen callback.

// 2. Configure Native DB (Postgres)
// Using a mock URL for demo purposes or a real one if available.
// Since we don't have a real Postgres instance in this environment,
// the connection might fail, but the architecture is valid.
const PG_URL = "postgres://user:pass@localhost:5432/mydb";

app.get('/public')
   .use(() => ({ message: "Public Access OK" }))
   .respond();

// Protected Route (Native JWT Check)
// If the token is invalid, Rust rejects it. Node.js never sees the request.
app.get('/protected')
   .jwt() // Enable Native JWT Policy
   .use(() => ({ message: "You have valid Native JWT!" }))
   .respond();

// Database Route
app.get('/users')
   .use(async (ctx) => {
       // This executes SQL in Rust and returns JSON string directly
       // Zero serialization overhead in Node.js!
       try {
           const result = await app.db.query("SELECT * FROM users");
           // Result is a JSON string string from Rust
           return JSON.parse(result);
       } catch (e: any) {
           // Fluent API handles errors if we throw with status
           throw { status: 500, message: e.message };
       }
   })
   .respond();

// Helper to generate token for testing
app.get('/login')
   .use(() => {
       const token = jsonwebtoken.sign({ sub: 'user123' }, SECRET, { expiresIn: '1h' });
       return { token };
   })
   .respond();

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    
    // Configure Native Layer
    try {
        app.auth.setJwtSecret(SECRET);
        console.log('Native JWT Secret Set');
        
        // Connect DB (Async)
        // app.db.connectPostgres(PG_URL).catch(e => console.error("DB Connect Failed (Expected without DB):", e));
        
    } catch (e) {
        console.error("Failed to configure native layer:", e);
    }
});
