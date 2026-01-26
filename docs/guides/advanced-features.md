# Advanced Features

This guide covers advanced capabilities of QHTTPX including static file serving, CORS configuration, file uploads, and TLS/SSL security.

## Static File Serving

Serve static files such as images, CSS, and JavaScript from a directory. This uses the high-performance native backend for efficient delivery.

```typescript
import { Q } from 'qhttpx';
import path from 'path';

const app = Q.app();

// Serve files from the './public' directory at the '/static' route
// Example: ./public/image.png -> http://localhost:3000/static/image.png
app.static('/static', './public');

app.listen(3000, () => {
    console.log('Static files serving at http://localhost:3000/static');
});
```

**See Example:** [static_demo.ts](../../examples/static_demo.ts)

## CORS Configuration

Cross-Origin Resource Sharing (CORS) is essential for modern web applications. QHTTPX allows you to configure CORS policies globally.

```typescript
import { Q } from 'qhttpx';

const app = Q.app();

app.cors({
    origin: 'http://localhost:3000', // Allow specific origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    headers: ['Content-Type', 'Authorization'],
    credentials: true // Allow cookies/auth headers
});

app.get('/api/data')
   .use(() => ({ data: 'Accessible from localhost:3000' }))
   .respond();

app.listen(4000);
```

**See Example:** [cors_demo.ts](../../examples/cors_demo.ts)

## File Uploads

Handle multipart/form-data file uploads efficiently. Files are streamed directly to disk by the native Rust engine.

```typescript
import { Q } from 'qhttpx';
import path from 'path';

const app = Q.app();
const uploadsDir = path.join(__dirname, 'uploads');

// Configure upload route
app.post('/upload', {
    upload: {
        dir: uploadsDir, // Directory to save files
        // maxFileSize: 1024 * 1024 * 10 // Optional limit (10MB)
    }
});

app.listen(3000, () => {
    console.log(`Uploads will be saved to ${uploadsDir}`);
});
```

**See Example:** [upload_demo.ts](../../examples/upload_demo.ts)

## TLS / SSL (HTTPS)

Enable HTTPS support by providing your certificate and private key paths when starting the server.

```typescript
import { Q } from 'qhttpx';
import path from 'path';

const app = Q.app();

app.get('/', (ctx) => {
    return ctx.send({ secure: true });
});

const options = {
    port: 3000,
    tls: {
        cert: path.join(__dirname, 'cert.pem'),
        key: path.join(__dirname, 'key.pem')
    }
};

app.listen(options, () => {
    console.log('Secure server running on https://localhost:3000');
});
```

**See Example:** [tls_demo.ts](../../examples/tls_demo.ts)

## HTTP/2 Support

QHTTPX natively supports HTTP/2. When you enable TLS (as shown above), HTTP/2 is automatically negotiated with supported clients.

**See Example:** [http2_demo.ts](../../examples/http2_demo.ts)
