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
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  async function deleteApp(id, e) {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    await fetch(`/api/apps/${id}`, { method: 'DELETE' });
    setDeleting(false);
    setConfirmDeleteId(null);
    loadApps();
  }

  return (
    <main className="container" style={{ paddingTop: 56, paddingBottom: 72 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="glow-dot" />
        <span className="eyebrow">Key-System</span>
      </div>
      <h1 className="display" style={{ fontSize: 30, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
        Your apps
      </h1>
      <p className="text-dim" style={{ fontSize: 14, marginTop: 0, marginBottom: 32, maxWidth: 520, lineHeight: 1.5 }}>
        No login — apps here are tied to this browser. Don't clear cookies
        or you'll lose the ability to manage them (players redeeming keys
        are never affected either way).
      </p>

      <form onSubmit={createApp} className="card" style={{ marginBottom: 28, display: 'flex', gap: 12 }}>
        <input
          placeholder="New app name — e.g. Emir's ImGui Loader"
          value={newAppName}
          onChange={(e) => setNewAppName(e.target.value)}
        />
        <button className="btn btn-primary" disabled={creating} style={{ whiteSpace: 'nowrap' }}>
          {creating ? 'Creating…' : '+ Create app'}
        </button>
      </form>

      {loading ? (
        <p className="text-dim">Loading…</p>
      ) : apps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <p style={{ margin: 0, fontSize: 14 }}>No apps yet</p>
          <p className="text-faint" style={{ fontSize: 13, marginTop: 6 }}>
            Create one above to get your first API key and claim link.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {apps.map((app) => (
            <Link key={app.id} href={`/apps/${app.id}`} style={{ textDecoration: 'none' }}>
              <div
                className="card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  marginBottom: 0,
                }}
              >
                <div>
                  <div className="display" style={{ fontWeight: 600, fontSize: 16 }}>{app.name}</div>
                  <div className="mono text-faint" style={{ fontSize: 12, marginTop: 5 }}>
                    {app.api_key.slice(0, 14)}••••••••
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {confirmDeleteId === app.id ? (
                    <>
                      <span className="text-dim" style={{ fontSize: 12, marginRight: 4 }}>
                        Delete permanently?
                      </span>
                      <button
                        className="btn"
                        style={{ fontSize: 12, padding: '6px 12px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                        disabled={deleting}
                        onClick={(e) => deleteApp(app.id, e)}
                      >
                        {deleting ? '…' : 'Confirm'}
                      </button>
                      <button
                        className="btn"
                        style={{ fontSize: 12, padding: '6px 12px' }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setConfirmDeleteId(null);
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-btn"
                        title="Delete app"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setConfirmDeleteId(app.id);
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                        </svg>
                      </button>
                      <span className="text-faint" style={{ fontSize: 13 }}>Manage →</span>
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p
        className="mono text-faint"
        style={{ textAlign: 'center', fontSize: 11, letterSpacing: 0.5, marginTop: 48, opacity: 0.7 }}
      >
        NO EXPLOIT — WE MAKE THIS ONLY FOR STUDIO/GAME
      </p>
    </main>
  );
}
