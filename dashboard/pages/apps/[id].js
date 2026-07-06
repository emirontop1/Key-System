import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const PIE_COLORS = ['#7c6cf0', '#f0b854', '#4ade80', '#f87171', '#69d2e7', '#c792ea', '#ff9e64'];

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
    </svg>
  );
}

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
  const [packages, setPackages] = useState([]);
  const [pkgLabel, setPkgLabel] = useState('');
  const [pkgHours, setPkgHours] = useState(24);
  const [pkgTaskCount, setPkgTaskCount] = useState(2);
  const [savingPkg, setSavingPkg] = useState(false);
  const [confirmRemoveTask, setConfirmRemoveTask] = useState(null);
  const [confirmRemovePkg, setConfirmRemovePkg] = useState(null);
  const [confirmDeleteApp, setConfirmDeleteApp] = useState(false);
  const [deletingApp, setDeletingApp] = useState(false);

  useEffect(() => {
    if (!id) return;
    load();
    loadAnalytics();
    loadPackages();
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

  async function loadPackages() {
    const res = await fetch(`/api/apps/${id}/packages`);
    if (res.ok) {
      const data = await res.json();
      setPackages(data.packages || []);
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
    setLoading(false);
  }

  async function addPackage(e) {
    e.preventDefault();
    if (!pkgLabel.trim()) return;
    setSavingPkg(true);
    await fetch(`/api/apps/${id}/packages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: pkgLabel.trim(),
        duration_hours: pkgHours,
        task_count: pkgTaskCount,
      }),
    });
    setPkgLabel('');
    setPkgHours(24);
    setPkgTaskCount(2);
    setSavingPkg(false);
    loadPackages();
  }

  async function removePackage(packageId) {
    await fetch(`/api/apps/${id}/packages?packageId=${packageId}`, { method: 'DELETE' });
    setConfirmRemovePkg(null);
    loadPackages();
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
    setConfirmRemoveTask(null);
    load();
  }

  async function deleteApp() {
    setDeletingApp(true);
    await fetch(`/api/apps/${id}`, { method: 'DELETE' });
    router.push('/dashboard');
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
    <main className="container" style={{ paddingTop: 48, paddingBottom: 72 }}>
      <button className="btn" onClick={() => router.push('/dashboard')} style={{ marginBottom: 28, fontSize: 13 }}>
        ← All apps
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>App</div>
          <h1 className="display" style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            {app.name}
          </h1>
        </div>

        {confirmDeleteApp ? (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 0 }}>
            <span style={{ fontSize: 12.5 }}>Delete this app and all its data?</span>
            <button
              className="btn"
              style={{ fontSize: 12, padding: '6px 12px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
              disabled={deletingApp}
              onClick={deleteApp}
            >
              {deletingApp ? '…' : 'Delete'}
            </button>
            <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setConfirmDeleteApp(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn-danger-ghost btn" style={{ fontSize: 12.5 }} onClick={() => setConfirmDeleteApp(true)}>
            <TrashIcon /> Delete app
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 28 }}>
        <label>App API key — embed in your Roblox script</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="mono" readOnly value={app.api_key} />
          <button className="btn" onClick={() => copy(app.api_key, 'key')} style={{ whiteSpace: 'nowrap' }}>
            {copied === 'key' ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        <div style={{ height: 18 }} />

        <label>Public key-claim link — share with players</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="mono" readOnly value={claimUrl} />
          <button className="btn" onClick={() => copy(claimUrl, 'link')} style={{ whiteSpace: 'nowrap' }}>
            {copied === 'link' ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 6 }}>Configuration</div>
      <h2 className="display" style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>
        Key packages
      </h2>
      <p className="text-dim" style={{ fontSize: 13, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
        Define how long keys last and how many random tasks they require —
        e.g. <span className="text-gold">24 Hour Key</span> for 2 tasks,{' '}
        <span className="text-gold">72 Hour Key</span> for 6. Task count 0
        means "require all tasks."
      </p>

      {packages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {packages.map((p) => (
            <div key={p.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge badge-gold">{p.duration_hours}h</span>
                <span style={{ fontWeight: 500 }}>{p.label}</span>
                <span className="text-faint" style={{ fontSize: 12 }}>
                  {p.task_count <= 0 ? 'all tasks' : `${p.task_count} random task(s)`}
                </span>
              </div>
              {confirmRemovePkg === p.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn"
                    style={{ fontSize: 12, padding: '6px 12px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    onClick={() => removePackage(p.id)}
                  >
                    Confirm
                  </button>
                  <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setConfirmRemovePkg(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="icon-btn" title="Remove package" onClick={() => setConfirmRemovePkg(p.id)}>
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {packages.length === 0 && (
        <p className="text-dim" style={{ fontSize: 13, marginBottom: 16 }}>
          No packages yet — add at least one below, or players won't have
          anything to choose on the claim page.
        </p>
      )}

      <form onSubmit={addPackage} className="card" style={{ marginBottom: 40 }}>
        <div className="field">
          <label>Label</label>
          <input placeholder="e.g. 24 Hour Key" value={pkgLabel} onChange={(e) => setPkgLabel(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Duration (hours)</label>
            <input
              type="number"
              min={1}
              value={pkgHours}
              onChange={(e) => setPkgHours(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Tasks required (0 = all)</label>
            <input
              type="number"
              min={0}
              max={tasks.length}
              value={pkgTaskCount}
              onChange={(e) => setPkgTaskCount(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <button className="btn btn-primary" disabled={savingPkg}>
          {savingPkg ? 'Adding…' : '+ Add package'}
        </button>
      </form>

      <div className="eyebrow" style={{ marginBottom: 6 }}>Configuration</div>
      <h2 className="display" style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>
        Tasks
      </h2>
      <p className="text-dim" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Players complete a random subset of these (per package) before a key is issued.
      </p>

      {tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {tasks.map((t, i) => (
            <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="mono text-faint" style={{ fontSize: 12 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontWeight: 500 }}>{t.title}</span>
                <span className="text-faint" style={{ fontSize: 12 }}>{t.wait_seconds}s wait</span>
              </div>
              {confirmRemoveTask === t.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn"
                    style={{ fontSize: 12, padding: '6px 12px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    onClick={() => removeTask(t.id)}
                  >
                    Confirm
                  </button>
                  <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setConfirmRemoveTask(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="icon-btn" title="Remove task" onClick={() => setConfirmRemoveTask(t.id)}>
                  <TrashIcon />
                </button>
              )}
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
          {saving ? 'Adding…' : '+ Add task'}
        </button>
      </form>

      <div className="eyebrow" style={{ marginTop: 44, marginBottom: 6 }}>Insights</div>
      <h2 className="display" style={{ fontSize: 18, fontWeight: 700, marginTop: 0, marginBottom: 4 }}>
        Analytics
      </h2>
      <p className="text-dim" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Self-reported by the Roblox script at the moment each key is verified.
        Informational only — never used to accept or reject a key.
      </p>

      {analyticsLoading ? (
        <p className="text-dim">Loading analytics…</p>
      ) : !analytics || analytics.total === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <p style={{ margin: 0, fontSize: 14 }}>No redemptions yet</p>
          <p className="text-faint" style={{ fontSize: 13, marginTop: 6 }}>
            Once players verify keys in-game, charts will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <p className="mono text-gold" style={{ fontSize: 13, marginTop: 0, marginBottom: 16, fontWeight: 600 }}>
              {analytics.total} total redemption{analytics.total === 1 ? '' : 's'}
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
                    <Tooltip contentStyle={{ background: '#12141c', border: '1px solid #23262f', borderRadius: 8, fontSize: 12 }} />
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
                      <Cell fill="#f0b854" />
                      <Cell fill="#7c6cf0" />
                    </Pie>
                    <Tooltip contentStyle={{ background: '#12141c', border: '1px solid #23262f', borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <p style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px' }}>Account age</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={Object.entries(analytics.accountAgeBuckets).map(([name, value]) => ({ name, value }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23262f" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888d9c' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#888d9c' }} />
                <Tooltip contentStyle={{ background: '#12141c', border: '1px solid #23262f', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="#7c6cf0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <p style={{ fontSize: 13, fontWeight: 600, marginTop: 0, marginBottom: 12 }}>Recent redemptions</p>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="text-faint" style={{ textAlign: 'left' }}>
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
        className="mono text-faint"
        style={{ textAlign: 'center', fontSize: 11, letterSpacing: 0.5, marginTop: 48, opacity: 0.7 }}
      >
        NO EXPLOIT — WE MAKE THIS ONLY FOR STUDIO/GAME
      </p>
    </main>
  );
}
