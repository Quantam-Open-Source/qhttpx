
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';

const PORT = 3000;
const FILE_CONTENT = "Hello, native multipart upload!";
const BOUNDARY = "--------------------------987654321098765432109876";

const postDataStart = Buffer.from(
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="fileToUpload"; filename="test.txt"\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    `${FILE_CONTENT}\r\n` +
    `--${BOUNDARY}--\r\n`
);

const uploadOptions = {
    hostname: 'localhost',
    port: PORT,
    path: '/upload',
    method: 'POST',
    headers: {
        'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`,
        'Content-Length': postDataStart.length
    }
};

console.log("Starting upload verification...");

const req = http.request(uploadOptions, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log(`BODY: ${data}`);
        
        // Verify file exists
        const uploadedFile = path.join(__dirname, 'uploads', 'test.txt');
        setTimeout(() => {
            if (fs.existsSync(uploadedFile)) {
                const content = fs.readFileSync(uploadedFile, 'utf8');
                if (content === FILE_CONTENT) {
                    console.log("SUCCESS: File uploaded and content matches!");
                    process.exit(0);
                } else {
                    console.error("FAILURE: File content mismatch.");
                    console.error(`Expected: ${FILE_CONTENT}`);
                    console.error(`Actual: ${content}`);
                    process.exit(1);
                }
            } else {
                console.error("FAILURE: Uploaded file not found.");
                process.exit(1);
            }
        }, 1000); // Give FS a moment to flush if needed
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
    process.exit(1);
});

req.write(postDataStart);
req.end();
