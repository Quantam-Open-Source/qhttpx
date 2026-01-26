import { Q } from 'qhttpx';

const app = Q.app();

app.cors();

app.security();

app.flow('GET', '/')
    .transform(() => ({ hello: 'world' }))
    .respond();

app.flow('GET', '/native-json')
    .transform(() => ({ message: 'This is a fluent JSON route.' }))
    .respond();

app.flow('GET', '/users/:id')
    .use((ctx) => ({
        type: 'dynamic',
        id: ctx.params.id,
        q: ctx.query.q
    }))
    .respond();

app.flow('POST', '/data')
    .use((ctx) => {
        try {
            const body = ctx.json();
            return { status: 'received', data: body };
        } catch {
            throw { status: 400, message: 'Invalid JSON' };
        }
    })
    .respond();

app.listen(3000, () => {
    // Enable structured logging from Rust core
    app.enableLogging();
    
    console.log('\n🚀 Server running on http://localhost:3000');
    console.log('   - Fluent Routes:      Enabled');
    console.log('   - Security Headers:   Enabled');
    console.log('   - Unified Response:   Enabled');
    console.log('   - Zero-Copy Body:     Enabled');

    console.log(app.getMetrics());

    console.log('   - Graceful Shutdown:  Enabled (Press Ctrl+C to test)\n');
});
