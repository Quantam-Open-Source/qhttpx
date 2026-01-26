
import { Q } from '../src/index';
import path from 'path';
import fs from 'fs';

const app = Q.app();
const PORT = 3000;

// Create a public directory with a large file
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
}

// Create 1MB file
const buffer = Buffer.alloc(1024 * 1024, 'a');
fs.writeFileSync(path.join(publicDir, '1mb.dat'), buffer);

// Serve static files
app.static('/public', './examples/public');

app.get('/')
   .use(() => ({ hello: 'world' }))
   .respond();

app.listen(PORT, () => {
    console.log(`Static File Server running on port ${PORT}`);
    console.log(`Try: http://localhost:${PORT}/public/1mb.dat`);
});
