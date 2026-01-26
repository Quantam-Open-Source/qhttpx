import { useEffect, useState, useRef } from 'react';

export default function Chat() {
  const [messages, setMessages] = useState<{ user: string, text: string }[]>([]);
  const [input, setInput] = useState('');
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WS
    // Note: In Vite dev mode, we might need to handle the port or proxy. 
    // The vite proxy sets /chat -> ws://localhost:3000, so we can use relative path if browser supports it, 
    // or just absolute path matching the proxy target if the proxy is for http.
    // Vite proxy for WS usually requires using the same host/port as the dev server but upgraded.
    // However, the proxy config had:
    // '/chat': { target: 'ws://localhost:3000', ws: true }
    // So `ws://localhost:5173/chat` (Vite port) should proxy to 3000.
    // But the original code used `ws://localhost:3000/chat` directly.
    // I'll stick to `ws://localhost:3000/chat` for simplicity as it was working before (CORS aside).
    
    ws.current = new WebSocket('ws://localhost:3000/chat');

    ws.current.onopen = () => {
      console.log('Connected to Chat');
      const token = localStorage.getItem('token');
      if (token) {
          ws.current?.send(JSON.stringify({ type: 'auth', token }));
      }
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat' || data.type === 'info') {
        setMessages(prev => [...prev, { user: data.user || 'System', text: data.message || data.text }]);
      } else if (data.type === 'error') {
          // alert(data.message);
          setMessages(prev => [...prev, { user: 'System', text: `Error: ${data.message}` }]);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    
    ws.current?.send(JSON.stringify({ type: 'chat', text: input }));
    
    setInput('');
  };

  return (
    <div className="container">
      <h2>Public Chat</h2>
      <div style={{ height: '300px', border: '1px solid #ccc', marginBottom: '20px', padding: '10px', overflowY: 'scroll', background: '#fff' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '5px', textAlign: 'left' }}>
            <strong>{m.user}:</strong> {m.text}
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ display: 'flex', gap: '10px' }}>
        <input 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder="Type a message..." 
            style={{ flexGrow: 1, padding: '8px' }}
        />
        <button type="submit" style={{ width: 'auto' }}>Send</button>
      </form>
    </div>
  );
}
