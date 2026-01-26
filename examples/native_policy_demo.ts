import { Q } from '../src';

const app = Q.app();
const PORT = 3007;

// 1. Native Rate Limiting
// No JS code runs if limit exceeded!
app.get('/limited', {
    json: { message: "I am rate limited by Rust!" }
})
.rateLimit({ limit: 3, window: 10 }); // 3 requests per 10 seconds

// 2. Native Caching
// First request hits Rust handler (or JS), subsequent hits served from Rust RAM
app.get('/cached', {
    json: { message: "I am cached by Rust!", timestamp: Date.now() }
})
.cache({ ttl: 5 }); // 5 seconds TTL

// 3. Combined Policies
app.get('/secure-cached', {
    json: { message: "I am both limited and cached!" }
})
.rateLimit({ limit: 5, window: 60 })
.cache({ ttl: 10 });

app.listen(PORT, () => {
    console.log(`Native Policy Demo running on http://localhost:${PORT}`);
    console.log('Test Routes:');
    console.log('  GET /limited       (Try refreshing quickly)');
    console.log('  GET /cached        (Timestamp stays static for 5s)');
    console.log('  GET /secure-cached (Combined policies)');
});
