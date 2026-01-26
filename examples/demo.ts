import { Q } from '../src';

const app = Q.app();

console.log('🚀 Starting QHTTPX Demo App...');

// 1. Basic Hello World - Type inference in action
app.get('/')
    .use((ctx, state) => ({ 
        message: 'Welcome to QHTTPX', 
        description: 'The Developer Experience First Framework',
        version: '1.0.0' 
    }))
    .respond();

// 2. Path Parameters - Automatic state injection
app.get('/users/:id')
    .use((ctx, state) => {
        // 'state.params' is automatically populated
        const userId = state.params.id;
        return { 
            id: userId, 
            status: 'active',
            role: 'developer' 
        };
    })
    .respond();

// 3. POST Request - Fluent Body Parsing
app.post('/echo')
    .use(async (ctx, state) => {
        // ctx is fully typed
        const body = await ctx.json();
        return { 
            received: body, 
            serverTime: new Date().toISOString() 
        };
    })
    .respond();

// 4. Custom Status Code
app.get('/health')
    .use((ctx, state) => ({ status: 'ok', uptime: process.uptime() }))
    .status(200)
    .respond();

const PORT = 3005;
app.listen(PORT, () => {
    console.log(`✨ Server running on http://localhost:${PORT}`);
    console.log(`📚 Try: curl http://localhost:${PORT}/users/123`);
    console.log(`📤 Try: curl -X POST http://localhost:${PORT}/echo -d '{"hello":"world"}'`);
});
