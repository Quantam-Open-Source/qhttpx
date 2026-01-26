import { useState } from 'react';
import api from '../api';

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    // Convert to Base64 (Temporary until multipart support)
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const res = await api.post('/upload', { name: file.name, data: base64 });
        setUploadedUrl(`http://localhost:3000${res.data.url}`);
      } catch (err) {
        alert('Upload failed');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="container">
      <h2>File Upload</h2>
      <form onSubmit={upload}>
        <input type="file" onChange={handleFileChange} style={{ border: 'none' }} />
        <button type="submit">Upload</button>
      </form>
      {uploadedUrl && (
        <div style={{ marginTop: '20px' }}>
          <p>Uploaded Successfully!</p>
          <a href={uploadedUrl} target="_blank" rel="noreferrer">View File</a>
          <br />
          {uploadedUrl.match(/\.(jpg|jpeg|png|gif)$/i) && (
             <img src={uploadedUrl} alt="Uploaded" style={{ maxWidth: '100%', marginTop: '10px' }} />
          )}
        </div>
      )}
    </div>
  );
}
