import http from 'http';

function get(path: string) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3000${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('1. Testing Normal Request (GET /)...');
    const res1: any = await get('/');
    console.log('Response:', res1);

    console.log('\n2. Testing Auth Middleware (GET /secret?auth=false)...');
    const res2: any = await get('/?auth=false'); // Using root path but blocked by middleware
    console.log('Response:', res2);

    console.log('\n3. Testing Error Middleware (GET /error)...');
    const res3: any = await get('/error');
    console.log('Response:', res3);
}

main().catch(console.error);
