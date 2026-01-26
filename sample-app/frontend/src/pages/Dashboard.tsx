
import { useState, useEffect } from 'react';
import api from '../api';

interface Stats {
    users: number;
    posts: number;
    todos: number;
    notes: number;
}

export default function Dashboard() {
  const [health, setHealth] = useState<string>('Loading...');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkHealth();
    fetchStats();
  }, []);

  const checkHealth = async () => {
    try {
      const res = await api.get('/health');
      if (typeof res.data === 'string' && res.data === 'OK') {
        setHealth('ok');
      } else {
        setHealth(res.data.status);
      }
    } catch (e) {
      setHealth('Offline');
    }
  };

  const fetchStats = async () => {
      try {
          const res = await api.get('/stats');
          setStats(res.data);
      } catch (e) {
          console.error("Failed to fetch stats", e);
      } finally {
          setLoading(false);
      }
  }

  return (
    <div className="container">
      <h2>System Dashboard</h2>
      
      <div style={{ marginBottom: '30px', padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3>System Status</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ 
                    width: '15px', 
                    height: '15px', 
                    borderRadius: '50%', 
                    background: health === 'ok' ? '#4caf50' : '#f44336' 
                }} />
                <span style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                    {(health || 'Unknown').toUpperCase()}
                </span>
            </div>
      </div>

      <h3>Overview</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <StatCard title="Users" value={stats?.users} icon="👥" loading={loading} />
        <StatCard title="Posts" value={stats?.posts} icon="🐦" loading={loading} />
        <StatCard title="Todos" value={stats?.todos} icon="✅" loading={loading} />
        <StatCard title="Notes" value={stats?.notes} icon="📝" loading={loading} />
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, loading }: { title: string, value?: number, icon: string, loading: boolean }) {
    return (
        <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', textAlign: 'center' }}>
            <div style={{ fontSize: '2em', marginBottom: '10px' }}>{icon}</div>
            <div style={{ color: '#666', fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</div>
            <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: '#333' }}>
                {loading ? '...' : (value ?? 0)}
            </div>
        </div>
    );
}
