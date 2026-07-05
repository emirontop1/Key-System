import { useEffect, useState } from 'react';
import Link from 'next/link';

// No login, no session - the browser gets an anonymous owner cookie the
// first time it hits any /api/apps* route (set automatically by the API).
// This page just lists whatever apps that cookie owns.
export default function Dashboard() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newAppName, setNewAppName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadApps();
  }, []);

  async function loadApps() {
    setLoading(true);
    const res = await fetch('/api/apps');
    const data = await res.json();
    setApps(data.apps || []);
    setLoading(false);
  }

  async function createApp(e) {
    e.preventDefault();
    if (!newAppName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newAppName.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      setNewAppName('');
      loadApps();
    }
  }

  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 36 }}>
        <div className="mono text-dim" style={{ fontSize: 13, letterSpacing: 1 }}>
          KEY-SYSTEM / DASHBOARD
        </div>
      </div>

      <p className="text-dim" style={{ fontSize: 13, marginTop: -24, marginBottom: 24 }}>
        No login - apps you create here are tied to this browser. Don't clear
        cookies or you'll lose access to manage them (players redeeming keys
        are unaffected either way).
      </p>

      <form onSubmit={createApp} className="card" style={{ marginBottom: 32, display: 'flex', gap: 12 }}>
        <input
          placeholder="New app name"
          value={newAppName}
          onChange={(e) => setNewAppName(e.target.value)}
        />
        <button className="btn btn-primary" disabled={creating} style={{ whiteSpace: 'nowrap' }}>
          {creating ? 'Creating…' : 'Create app'}
        </button>
      </form>

      {loading ? (
        <p className="text-dim">Loading…</p>
      ) : apps.length === 0 ? (
        <p className="text-dim">No apps yet. Create one above to get your first API key.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {apps.map((app) => (
            <Link key={app.id} href={`/apps/${app.id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{app.name}</div>
                  <div className="mono text-dim" style={{ fontSize: 12, marginTop: 4 }}>
                    {app.api_key.slice(0, 12)}••••••••
                  </div>
                </div>
                <span className="text-dim" style={{ fontSize: 13 }}>Manage →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
