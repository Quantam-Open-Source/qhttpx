import { Q } from '../src';

const app = Q.app();

// Simple response using intuitive fluent API
app.get('/')
    .use((ctx, state) => ({ message: "Hello from QHTTPX!", timestamp: Date.now() }))
    .respond(200);

// Async operation using intuitive fluent API  
app.get('/async')
    .use(async (ctx, state) => {
        await new Promise(r => setTimeout(r, 100)); // Sleep 100ms
        return { message: "Async Hello!", delayed: true };
    })
    .status(201)
    .respond();

app.listen(3000, () => {
    console.log('Response Demo running on port 3000');
});
