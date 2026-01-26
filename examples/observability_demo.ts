
import { Q } from '../src';

const app = Q.app();

// 1. Enable Structured JSON Logging
// Run with RUST_LOG=info node observability_demo.js
app.enableLogging();

app.get('/', (c) => {
    return c.send({ message: "Hello Observability" });
});

app.get('/error', (c) => {
    throw new Error("Something went wrong");
});

// 2. Metrics are automatically exposed at /metrics
// Try: curl http://localhost:3000/metrics

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    console.log('Metrics available at http://localhost:3000/metrics');
});
