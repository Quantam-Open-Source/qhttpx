import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DirectMessages() {
  const [messages, setMessages] = useState<{ user: string, text: string, isDm?: boolean }[]>([]);
  const [input, setInput] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
        navigate('/login');
        return;
    }

    // Connect to WS
    ws.current = new WebSocket('ws://localhost:3000/chat');

    ws.current.onopen = () => {
      console.log('Connected to DM Chat');
      if (token) {
          console.log('Sending auth token on connection...');
          ws.current?.send(JSON.stringify({ type: 'auth', token }));
      } else {
          console.log('No token found during connection');
      }
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'dm') {
        let userDisplay = `[DM] ${data.from}`;
        setMessages(prev => [...prev, { user: userDisplay, text: data.text, isDm: true }]);
      } else if (data.type === 'error') {
          // Temporarily disabled auto-logout to debug server error
          setMessages(prev => [...prev, { user: 'System', text: `Error: ${data.message}` }]);
          
          /* 
          if (data.message === 'Invalid token' || data.message.includes('logged in')) {
              localStorage.removeItem('token');
              navigate('/login');
          } else {
              setMessages(prev => [...prev, { user: 'System', text: `Error: ${data.message}` }]);
          }
          */
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [navigate]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || !toEmail) return;
    
    // Optimistic check? Or just send.
    // If we are not authed, the server will send an error, which we handle above.
    const token = localStorage.getItem('token');
    if (!token) {
        setMessages(prev => [...prev, { user: 'System', text: 'Error: No local token found. Please login again.' }]);
        return;
    }
    ws.current?.send(JSON.stringify({ type: 'dm', to: toEmail, text: input, token }));
    
    // Optimistic update
    setMessages(prev => [...prev, { user: `Me -> ${toEmail}`, text: input, isDm: true }]);
    
    setInput('');
  };

  return (
    <div className="container">
      <h2>Direct Messages</h2>
      
      <div style={{ height: '300px', border: '1px solid #ccc', marginBottom: '20px', padding: '10px', overflowY: 'scroll', background: '#fff' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '5px', textAlign: 'left', color: m.user.startsWith('System') ? 'red' : 'blue' }}>
            <strong>{m.user}:</strong> {m.text}
          </div>
        ))}
      </div>
      
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input 
            value={toEmail} 
            onChange={e => setToEmail(e.target.value)} 
            placeholder="Recipient Email (Required)" 
            style={{ padding: '8px' }}
            required
        />
        <div style={{ display: 'flex', gap: '10px' }}>
            <input 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                placeholder="Type a message..." 
                style={{ flexGrow: 1, padding: '8px' }}
                required
            />
            <button type="submit" style={{ width: 'auto' }}>Send</button>
        </div>
      </form>
    </div>
  );
}
