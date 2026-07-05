import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const PIE_COLORS = ['#7c9eff', '#ff8fa3', '#ffd166', '#8be9a0', '#c792ea', '#ff9e64', '#69d2e7'];

export default function AppDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [app, setApp] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [waitSeconds, setWaitSeconds] = useState(15);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [taskCountInput, setTaskCountInput] = useState(0);
  const [savingCount, setSavingCount] = useState(false);
  const [countSaved, setCountSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    load();
    loadAnalytics();
  }, [id]);

  async function loadAnalytics() {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/apps/${id}/analytics`);
      if (res.ok) setAnalytics(await res.json());
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/apps/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setApp(data.app);
    setTasks(data.tasks || []);
    setTaskCountInput(data.app.task_count || 0);
    setLoading(false);
  }

  async function saveTaskCount() {
    setSavingCount(true);
    setCountSaved(false);
    try {
      const res = await fetch(`/api/apps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_count: taskCountInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setApp(data.app);
        setCountSaved(true);
        setTimeout(() => setCountSaved(false), 1500);
      }
    } finally {
      setSavingCount(false);
    }
  }

  async function addTask(e) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setSaving(true);
    await fetch(`/api/apps/${id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), url: url.trim(), wait_seconds: waitSeconds }),
    });
    setTitle('');
    setUrl('');
    setWaitSeconds(15);
    setSaving(false);
    load();
  }

  async function removeTask(taskId) {
    await fetch(`/api/apps/${id}/tasks?taskId=${taskId}`, { method: 'DELETE' });
    load();
  }

  function copy(text, label) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  if (notFound) {
    return (
      <main className="container" style={{ paddingTop: 48 }}>
        <p className="text-dim">
          App not found (or it belongs to a different browser). {' '}
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </main>
    );
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

      <div className="card" style={{ marginBottom: 24 }}>
        <label>How many tasks should players complete?</label>
        <p className="text-dim" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>
          A random subset of this size is picked from your task list below
          for each player. Set to 0 to require all tasks.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            min={0}
            max={tasks.length}
            value={taskCountInput}
            onChange={(e) => setTaskCountInput(Math.max(0, Number(e.target.value) || 0))}
            style={{ maxWidth: 120 }}
          />
          <button className="btn btn-primary" disabled={savingCount} onClick={saveTaskCount}>
            {savingCount ? 'Saving…' : countSaved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
        <p className="text-dim" style={{ fontSize: 12, marginTop: 8 }}>
          {taskCountInput <= 0 || taskCountInput >= tasks.length
            ? `Currently: all ${tasks.length} task(s) required.`
            : `Currently: ${taskCountInput} random task(s) out of ${tasks.length} required.`}
        </p>
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

      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '36px 0 12px' }}>Analytics</h2>
      <p className="text-dim" style={{ fontSize: 13, marginTop: -8, marginBottom: 16 }}>
        Self-reported by the Roblox script at the moment each key is verified.
        Informational only - never used to accept or reject a key.
      </p>

      {analyticsLoading ? (
        <p className="text-dim">Loading analytics…</p>
      ) : !analytics || analytics.total === 0 ? (
        <p className="text-dim">No redemptions yet. Once players verify keys in-game, charts will appear here.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <p className="text-dim" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
              Total redemptions: {analytics.total}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Executor</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={Object.entries(analytics.executorCounts).map(([name, value]) => ({ name, value }))}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      label
                    >
                      {Object.keys(analytics.executorCounts).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Studio vs. Live game</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Studio', value: analytics.studioVsGame.studio },
                        { name: 'Live game', value: analytics.studioVsGame.game },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      label
                    >
                      <Cell fill="#ffd166" />
                      <Cell fill="#7c9eff" />
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <p style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px' }}>Account age</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={Object.entries(analytics.accountAgeBuckets).map(([name, value]) => ({ name, value }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#8be9a0" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <p style={{ fontSize: 13, fontWeight: 600, marginTop: 0, marginBottom: 12 }}>Recent redemptions</p>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="text-dim" style={{ textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px' }}>Player</th>
                    <th style={{ padding: '4px 8px' }}>Executor</th>
                    <th style={{ padding: '4px 8px' }}>Studio</th>
                    <th style={{ padding: '4px 8px' }}>Age (days)</th>
                    <th style={{ padding: '4px 8px' }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recent.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '4px 8px' }}>{r.player_name || '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{r.executor || '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{r.is_studio ? 'Yes' : 'No'}</td>
                      <td style={{ padding: '4px 8px' }}>{r.account_age_days ?? '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <p
        className="mono text-dim"
        style={{ textAlign: 'center', fontSize: 11, letterSpacing: 0.5, marginTop: 40, opacity: 0.6 }}
      >
        NO EXPLOIT — WE MAKE THIS ONLY FOR STUDIO/GAME
      </p>
    </main>
  );
}
