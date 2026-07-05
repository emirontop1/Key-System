import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newAppName, setNewAppName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/');
        return;
      }
      setSession(data.session);
      loadApps();
    });
  }, []);

  async function loadApps() {
    setLoading(true);
    const { data, error } = await supabase
      .from('apps')
      .select('id, name, api_key, created_at')
      .order('created_at', { ascending: false });
    if (!error) setApps(data || []);
    setLoading(false);
  }

  async function createApp(e) {
    e.preventDefault();
    if (!newAppName.trim()) return;
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('apps')
      .insert({ name: newAppName.trim(), owner_id: userData.user.id });
    setCreating(false);
    if (!error) {
      setNewAppName('');
      loadApps();
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (!session) return null;

  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 36 }}>
        <div className="mono text-dim" style={{ fontSize: 13, letterSpacing: 1 }}>
          KEY-SYSTEM / DASHBOARD
        </div>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>

      <form onSubmit={createApp} className="card" style={{ marginBottom: 32, display: 'flex', gap: 12 }}>
        <input
          placeholder="New app name (e.g. Emir's ImGui Loader)"
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
