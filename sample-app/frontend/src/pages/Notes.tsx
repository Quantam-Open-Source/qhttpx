import { useEffect, useState } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';

interface Note {
  id: number;
  title: string;
  content: string;
  created_at: string;
}

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const res = await api.get('/notes');
      setNotes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch notes:', err);
      navigate('/login');
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    await api.post('/notes', { title, content });
    setTitle('');
    setContent('');
    fetchNotes();
  };

  const remove = async (id: number) => {
    await api.delete(`/notes/${id}`);
    fetchNotes();
  };

  return (
    <div className="container">
      <h2>My Notes</h2>
      
      <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
        <input 
          value={title} 
          onChange={e => setTitle(e.target.value)} 
          placeholder="Note Title..." 
          style={{ padding: '8px' }}
        />
        <textarea 
          value={content} 
          onChange={e => setContent(e.target.value)} 
          placeholder="Note Content..." 
          style={{ padding: '8px', minHeight: '100px' }}
        />
        <button type="submit" style={{ padding: '8px', alignSelf: 'flex-start' }}>Save Note</button>
      </form>

      <div style={{ display: 'grid', gap: '15px' }}>
        {notes.map(n => (
          <div key={n.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '4px', position: 'relative' }}>
            <h3 style={{ marginTop: 0 }}>{n.title}</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{n.content}</p>
            <small style={{ color: '#666' }}>{new Date(n.created_at).toLocaleString()}</small>
            <button 
                onClick={() => remove(n.id)} 
                style={{ position: 'absolute', top: '10px', right: '10px', background: 'red', color: 'white', border: 'none', padding: '5px 10px', cursor: 'pointer' }}
            >
                Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
