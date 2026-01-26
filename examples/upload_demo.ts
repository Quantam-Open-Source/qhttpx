
import { Q } from '../src/index';
import path from 'path';
import fs from 'fs';

const app = Q.app();
const PORT = 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Serve static HTML form
const html = `
<!DOCTYPE html>
<html>
<body>
<h2>Upload File</h2>
<form action="/upload" method="post" enctype="multipart/form-data">
  Select file to upload:
  <input type="file" name="fileToUpload" id="fileToUpload">
  <input type="submit" value="Upload Image" name="submit">
</form>
</body>
</html>
`;

app.get('/', { text: html });

// Register upload route
app.post('/upload', {
    upload: {
        dir: uploadsDir,
        // Handler is currently optional and notification is TODO in Rust
    }
});

app.listen(PORT, () => {
    console.log(`Upload Server running on port ${PORT}`);
    console.log(`Try: http://localhost:${PORT}/`);
});
