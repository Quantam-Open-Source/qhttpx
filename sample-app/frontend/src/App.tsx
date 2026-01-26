import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Todos from './pages/Todos';
import Notes from './pages/Notes';
import Chat from './pages/Chat';
import DirectMessages from './pages/DirectMessages';
import Upload from './pages/Upload';
import Dashboard from './pages/Dashboard';
import Social from './pages/Social';
import './App.css';

function Layout({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <>{children}</>;

  return (
    <div>
      <nav style={{ padding: '10px', background: '#f0f0f0', marginBottom: '20px', display: 'flex', gap: '20px', justifyContent: 'center' }}>
        <Link to="/">Todos</Link>
        <Link to="/notes">Notes</Link>
        <Link to="/social">Social 🐦</Link>
        <Link to="/chat">Chat</Link>
        <Link to="/dms">DMs</Link>
        <Link to="/upload">Upload</Link>
        <Link to="/dashboard">Dashboard</Link>
        <button onClick={() => { localStorage.removeItem('token'); window.location.href = '/login'; }}>Logout</button>
      </nav>
      {children}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={<Todos />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/social" element={<Social />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/dms" element={<DirectMessages />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
