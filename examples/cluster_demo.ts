
import { Q } from '../src';

const app = Q.app();

// 1. Distributed Rate Limiting
// Just by connecting Redis, all rate limits become distributed!
// app.db.connectRedis("redis://127.0.0.1:6379");

app.get('/expensive', (c) => {
    return c.send({ data: "Expensive computation" });
})
.rateLimit({ limit: 10, window: 60 }); // 10 reqs / min shared across ALL instances

// 2. Native Redis Access
// Use the shared Redis connection for your own data
app.get('/cache', async (c) => {
    await app.db.redis.set("my_key", "hello from rust", 300);
    const val = await app.db.redis.get("my_key");
    return c.send({ val });
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    // app.db.connectRedis("redis://localhost:6379");
});
