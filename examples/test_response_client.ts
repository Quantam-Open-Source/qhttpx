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
    console.log('Testing / ...');
    const res1: any = await get('/');
    console.log('Response 1:', res1);

    console.log('\nTesting /async ...');
    const res2: any = await get('/async');
    console.log('Response 2:', res2);
}

main().catch(console.error);
