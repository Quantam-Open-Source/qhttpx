
import { Q } from '../src';

const app = Q.app();

// 1. Enable Structured JSON Logging
// Run with RUST_LOG=info node observability_demo.js
app.enableLogging();

app.get('/')
   .use(() => ({ message: "Hello Observability" }))
   .respond();

app.get('/error')
   .use(() => {
       throw new Error("Something went wrong");
   })
   .respond();

// 2. Metrics are automatically exposed at /metrics
// Try: curl http://localhost:3000/metrics

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    console.log('Metrics available at http://localhost:3000/metrics');
});
