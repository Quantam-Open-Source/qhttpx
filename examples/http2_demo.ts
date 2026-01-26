
import { Q } from '../src';
import http2 from 'http2';
import http from 'http';

const app = Q.app();

app.get('/h2', (c) => {
    c.send('Hello from QHTTPX!');
});

app.listen(3003, async () => {
    console.log('Server listening on port 3003');
    
    // Test 1: HTTP/2
    console.log('\n--- Testing HTTP/2 ---');
    await new Promise<void>((resolve) => {
        const client = http2.connect('http://localhost:3003');
        const req = client.request({ ':path': '/h2' });
        
        req.on('response', (headers) => {
            console.log('H2 Headers:', headers[':status']);
        });
        
        req.setEncoding('utf8');
        let data = '';
        req.on('data', c => data += c);
        req.on('end', () => {
            console.log('H2 Body:', data);
            client.close();
            resolve();
        });
        req.end();
    });

    // Test 2: HTTP/1.1
    console.log('\n--- Testing HTTP/1.1 ---');
    await new Promise<void>((resolve) => {
        const req = http.get('http://localhost:3003/h2', (res) => {
            console.log('H1 Status:', res.statusCode);
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                console.log('H1 Body:', data);
                resolve();
            });
        });
        req.on('error', console.error);
    });

    process.exit(0);
});
