import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function AppDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [app, setApp] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [waitSeconds, setWaitSeconds] = useState(15);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    const { data: appData } = await supabase.from('apps').select('*').eq('id', id).single();
    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('app_id', id)
      .order('order_index', { ascending: true });
    setApp(appData);
    setTasks(taskData || []);
    setLoading(false);
  }

  async function addTask(e) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setSaving(true);
    await supabase.from('tasks').insert({
      app_id: id,
      title: title.trim(),
      url: url.trim(),
      wait_seconds: Number(waitSeconds) || 15,
      order_index: tasks.length,
    });
    setTitle('');
    setUrl('');
    setWaitSeconds(15);
    setSaving(false);
    load();
  }

  async function removeTask(taskId) {
    await supabase.from('tasks').delete().eq('id', taskId);
    load();
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  if (loading || !app) return null;

  const claimUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/claim/${app.id}`;

  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 64 }}>
      <button className="btn" onClick={() => router.push('/dashboard')} style={{ marginBottom: 24 }}>
        ← All apps
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>{app.name}</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <label>App API key (embed in your Roblox script)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="mono" readOnly value={app.api_key} />
          <button className="btn" onClick={() => copy(app.api_key, 'key')}>
            {copied === 'key' ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div style={{ height: 16 }} />

        <label>Public key-claim link (share with players)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="mono" readOnly value={claimUrl} />
          <button className="btn" onClick={() => copy(claimUrl, 'link')}>
            {copied === 'link' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Tasks</h2>
      <p className="text-dim" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Players complete these in order before a key is issued.
      </p>

      {tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {tasks.map((t, i) => (
            <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
              <div>
                <span className="mono text-dim" style={{ fontSize: 12, marginRight: 10 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontWeight: 500 }}>{t.title}</span>
                <span className="text-dim" style={{ fontSize: 12, marginLeft: 10 }}>{t.wait_seconds}s wait</span>
              </div>
              <button className="btn" onClick={() => removeTask(t.id)} style={{ fontSize: 12, padding: '6px 12px' }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addTask} className="card">
        <div className="field">
          <label>Task title</label>
          <input placeholder="e.g. Visit our Discord" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Link URL</label>
          <input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="field">
          <label>Wait time (seconds)</label>
          <input type="number" min={3} max={120} value={waitSeconds} onChange={(e) => setWaitSeconds(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add task'}
        </button>
      </form>
    </main>
  );
}
