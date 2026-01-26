import { Q } from '../src';
import autocannon from 'autocannon';

const PORT = 3001;

// Generate a medium payload (~1.5KB -> ~150B)
const LARGE_DATA = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    active: true
}));

const app = Q.app();

// Zero-Copy Static JSON Route
app.get('/', {
    json: LARGE_DATA 
});

async function runBenchmark() {
    return new Promise((resolve) => {
        console.log(`\nStarting benchmark for QHTTPX on port ${PORT}...`);
        const instance = autocannon({
            url: `http://localhost:${PORT}`,
            connections: 100,
            pipelining: 50,
            duration: 40,
            latency: {
                percentiles: [1, 2.5, 50, 55, 97.5, 99]
            }
        } as any, (err, result) => {
            if (err) {
                console.error(err);
            } else {
                console.log(`QHTTPX Results:`);
                console.log(`  Requests/sec: ${result.requests.average.toFixed(2)} (StdDev: ${result.requests.stddev.toFixed(2)})`);
                console.log(`  Latency (avg): ${result.latency.average.toFixed(2)} ms`);
                console.log(`  Latency (p50): ${result.latency.p50} ms`);
                console.log(`  Latency (p55): ${(result.latency as any).p55} ms`);
                console.log(`  Latency (p99): ${result.latency.p99} ms`);
                console.log(`  Latency (max): ${result.latency.max} ms`);
                console.log(`  Throughput: ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
                resolve(result);
            }
        });
        autocannon.track(instance, { renderProgressBar: true });
    });
}

async function main() {
    console.log('Starting QHTTPX...');
    await new Promise<void>(resolve => app.listen(PORT, resolve));
    console.log(`Server running on http://localhost:${PORT}`);

    // Give server a moment to settle
    await new Promise(r => setTimeout(r, 1000));

    await runBenchmark();

    process.exit(0);
}

main().catch(console.error);
