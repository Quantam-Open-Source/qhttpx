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
            duration: 160
        }, (err, result) => {
            if (err) {
                console.error(err);
            } else {
                console.log(`QHTTPX Results:`);
                console.log(`  Requests/sec: ${result.requests.average}`);
                console.log(`  Latency (avg): ${result.latency.average} ms`);
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
