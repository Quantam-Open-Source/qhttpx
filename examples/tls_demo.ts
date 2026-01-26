
import { Q } from '../src';
import path from 'path';
import fs from 'fs';

const app = Q.app();

// Check for certificates
const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.error('TLS Demo requires cert.pem and key.pem in examples directory.');
    console.error('You can generate them using openssl:');
    console.error('openssl req -x509 -newkey rsa:4096 -keyout examples/key.pem -out examples/cert.pem -days 365 -nodes');
    process.exit(1);
}

app.get('/')
   .use(() => ({ message: "Secure Hello from Native HTTP/2!" }))
   .respond();

app.listen({
    port: 3000,
    tls: {
        cert: certPath,
        key: keyPath
    }
}, () => {
    console.log('Secure Server running on https://localhost:3000');
    console.log('Try: curl -k https://localhost:3000/');
});
