import { Q } from '../src';
import http from 'http';

const app = Q.app();
const PORT = 3006;
const DURATION = 5000; // 5 seconds

// Native Route
app.get('/', {
    json: { hello: 'world' }
});

async function runBenchmark(path: string, name: string) {
    let requests = 0;
    let errors = 0;
    const start = Date.now();
    const end = start + DURATION;
    
    // Run concurrent requests
    const CONCURRENCY = 50;
    
    await new Promise<void>((resolve) => {
        let active = 0;
        
        const next = () => {
            if (Date.now() >= end) {
                if (active === 0) resolve();
                return;
            }
            
            active++;
            http.request(`http://localhost:${PORT}${path}`, { agent: false }, (res) => {
                res.resume(); // Consume body
                res.on('end', () => {
                    if (res.statusCode === 200) requests++;
                    else errors++;
                    active--;
                    next();
                });
            }).on('error', () => {
                errors++;
                active--;
                next();
            }).end();
        };

        for (let i = 0; i < CONCURRENCY; i++) next();
    });

    const durationSeconds = (Date.now() - start) / 1000;
    const rps = requests / durationSeconds;
    
    console.log(`${name}:`);
    console.log(`  Requests: ${requests}`);
    console.log(`  RPS: ${rps.toFixed(2)}`);
    console.log(`  Errors: ${errors}`);
    return rps;
}

app.listen(PORT, async () => {
    console.log(`Benchmark Server running on port ${PORT}`);
    
    console.log('\n--- Benchmarking QHTTPX Native ---');
    await runBenchmark('/', 'Native');
    
    process.exit(0);
});
