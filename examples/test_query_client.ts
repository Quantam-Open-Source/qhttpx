import http from 'http';

async function get(path: string) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3000${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                   const json = JSON.parse(data);
                   resolve({ status: res.statusCode, body: json });
                } catch {
                   resolve({ status: res.statusCode, body: data });
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('Testing Path Params (/users/42)...');
    const res1: any = await get('/users/42');
    console.log('Response:', res1.body);

    console.log('\nTesting Query Params (/search?q=rust&page=2)...');
    const res2: any = await get('/search?q=rust&page=2');
    console.log('Response:', res2.body);
    
    console.log('\nTesting Query Params Array (/search?tags=a&tags=b)...');
    const res3: any = await get('/search?tags=a&tags=b');
    console.log('Response:', res3.body);
}

main().catch(console.error);
