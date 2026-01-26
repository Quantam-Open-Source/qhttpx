import { Q } from '../src';

const app = Q.app();

// 1. Rate Limited Route
// Limit: 5 requests per 10 seconds
app.get('/limited')
   .rateLimit({ limit: 5, window: 10 })
   .use(() => ({ message: "I am rate limited!" }))
   .respond();

// 2. Cached Route
// TTL: 10 seconds
// The handler sleeps for 2 seconds to simulate slow work
app.get('/cached')
   .cache({ ttl: 10 })
   .use(async () => {
       // Simulate slow DB call
       await new Promise(resolve => setTimeout(resolve, 2000));
       return { 
           message: "I am cached!", 
           timestamp: Date.now() 
       };
   })
   .respond();

// 3. Normal Route
app.get('/normal')
   .use(() => ({ message: "I am normal" }))
   .respond();

app.listen(3000, () => {
    console.log('Middleware Demo running on http://localhost:3000');
    console.log('Test Rate Limit: curl http://localhost:3000/limited');
    console.log('Test Cache: curl http://localhost:3000/cached');
});
