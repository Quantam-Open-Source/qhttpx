import { Q } from '../src';

const app = Q.app();

// Configure CORS
app.cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization', 'X-Custom-Header'],
    credentials: true
});

app.get('/')
   .use(() => ({ message: 'Hello with CORS!' }))
   .respond();

app.post('/data')
   .use(() => ({ status: 'received' }))
   .respond();

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`CORS Demo running on http://localhost:${PORT}`);
    console.log('Allowed Origin: http://localhost:3000');
});
