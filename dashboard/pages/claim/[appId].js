import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export default function ClaimPage() {
  const router = useRouter();
  const { appId } = router.query;

  const [phase, setPhase] = useState('loading'); // loading | choose_package | tasks | waiting | done | error
  const [appName, setAppName] = useState('');
  const [packages, setPackages] = useState([]);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [tasks, setTasks] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalWait, setTotalWait] = useState(1);
  const [log, setLog] = useState([]);
  const [licenseKey, setLicenseKey] = useState('');
  const [keyIssuedAt, setKeyIssuedAt] = useState(null);
  const [keyExpiresAt, setKeyExpiresAt] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const startedAtRef = useRef(null);

  useEffect(() => {
    if (!appId) return;
    loadPackages();
  }, [appId]);

  function pushLog(line) {
    setLog((prev) => [...prev, line]);
  }

  async function loadPackages() {
    setPhase('loading');
    try {
      const res = await fetch(`${API_BASE}/api/apps/${appId}/public-packages`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');

      setAppName(data.name);
      setPackages(data.packages || []);

      if (!data.packages || data.packages.length === 0) {
        setErrorMsg('This app has no key packages set up yet. Ask the developer to add one.');
        setPhase('error');
        return;
      }

      setSelectedPackageId(data.packages[0].id);
      setPhase('choose_package');
    } catch (err) {
      setErrorMsg('Could not load this app. The link may be invalid.');
      setPhase('error');
    }
  }

  async function startSession() {
    setPhase('loading');
    try {
      const res = await fetch(`${API_BASE}/api/session/start-by-app-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, packageId: selectedPackageId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed_to_start');

      setAppName(data.appName);
      setSessionToken(data.sessionToken);
      setTasks(data.tasks);
      pushLog(`[i] ${data.packageLabel} selected — ${data.tasks.length} task(s) assigned, key valid ${data.durationHours}h`);
      setPhase('tasks');
    } catch (err) {
      setErrorMsg('Could not start session. The link may be invalid.');
      setPhase('error');
    }
  }

  function openTask(task) {
    window.open(task.url, '_blank', 'noopener,noreferrer');
    startedAtRef.current = Date.now();
    setActiveTask(task);
    setSecondsLeft(task.waitSeconds);
    setTotalWait(task.waitSeconds || 1);
    setPhase('waiting');
    pushLog(`[…] opened "${task.title}", waiting ${task.waitSeconds}s`);
  }

  useEffect(() => {
    if (phase !== 'waiting' || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft]);

  async function confirmTask() {
    try {
      const res = await fetch(`${API_BASE}/api/session/complete-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          taskId: activeTask.id,
          startedAt: startedAtRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');

      setCompletedIds((prev) => [...prev, activeTask.id]);
      pushLog(`[✓] "${activeTask.title}" verified`);
      setActiveTask(null);

      if (data.allDone) {
        await claimKey();
      } else {
        setPhase('tasks');
      }
    } catch (err) {
      pushLog(`[x] verification failed — try waiting the full time`);
      setPhase('tasks');
    }
  }

  async function claimKey() {
    pushLog('[i] all tasks complete, issuing key…');
    const res = await fetch(`${API_BASE}/api/session/claim-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    });
    const data = await res.json();
    if (res.ok) {
      setLicenseKey(data.key);
      setKeyIssuedAt(data.issuedAt);
      setKeyExpiresAt(data.expiresAt);
      pushLog(`[✓] key issued`);
      setPhase('done');
    } else {
      setErrorMsg('Could not issue key. Please refresh and try again.');
      setPhase('error');
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(licenseKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1600);
  }

  const doneCount = completedIds.length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const waitPct = totalWait > 0 ? Math.max(0, Math.min(100, ((totalWait - secondsLeft) / totalWait) * 100)) : 100;

  return (
    <main className="container" style={{ paddingTop: 44, paddingBottom: 64, maxWidth: 540 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className="glow-dot" />
        <span className="eyebrow">Key-System</span>
      </div>
      <h1 className="display" style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        {appName || 'Loading…'}
      </h1>

      {phase === 'tasks' && totalCount > 0 && (
        <div style={{ margin: '18px 0 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="text-faint mono" style={{ fontSize: 11 }}>
              {doneCount} / {totalCount} complete
            </span>
            <span className="text-faint mono" style={{ fontSize: 11 }}>{progressPct}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div
              style={{
                height: '100%',
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, var(--accent), var(--accent-bright))',
                transition: 'width 0.4s ease',
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <p style={{ margin: 0, fontSize: 14 }}>{errorMsg}</p>
        </div>
      )}

      {phase === 'choose_package' && (
        <div className="card">
          <p className="text-dim" style={{ marginTop: 0, marginBottom: 16, fontSize: 13.5, lineHeight: 1.5 }}>
            Choose the key you want. Longer keys require more tasks.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {packages.map((p) => {
              const selected = selectedPackageId === p.id;
              return (
                <label
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected ? 'rgba(124, 108, 240, 0.08)' : 'var(--bg-elevated)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="radio"
                      name="package"
                      checked={selected}
                      onChange={() => setSelectedPackageId(p.id)}
                    />
                    <span>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
                      <div className="text-faint mono" style={{ fontSize: 11, marginTop: 2 }}>
                        {p.duration_hours}h validity
                      </div>
                    </span>
                  </span>
                  <span className="badge" style={{ background: 'var(--gold-dim)', color: 'var(--gold-bright)' }}>
                    {p.task_count <= 0 ? 'all tasks' : `${p.task_count} task${p.task_count === 1 ? '' : 's'}`}
                  </span>
                </label>
              );
            })}
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: '13px' }} onClick={startSession}>
            Continue →
          </button>
        </div>
      )}

      {phase === 'tasks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map((t, i) => {
            const done = completedIds.includes(t.id);
            return (
              <div
                key={t.id}
                className="card"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: done ? 0.55 : 1,
                  marginBottom: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: done ? 'var(--success-dim)' : 'var(--bg-elevated)',
                      color: done ? 'var(--success)' : 'var(--text-faint)',
                      border: `1px solid ${done ? 'transparent' : 'var(--border)'}`,
                    }}
                  >
                    {done ? '✓' : String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{t.title}</span>
                </div>
                {done ? (
                  <span className="badge badge-success">done</span>
                ) : (
                  <button className="btn btn-primary" onClick={() => openTask(t)} style={{ fontSize: 13 }}>
                    Start
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {phase === 'waiting' && activeTask && (
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <p className="text-faint" style={{ marginBottom: 4, fontSize: 12.5 }}>Waiting for</p>
          <p style={{ fontWeight: 600, marginTop: 0, fontSize: 15 }}>{activeTask.title}</p>

          <div style={{ position: 'relative', width: 120, height: 120, margin: '20px auto' }}>
            <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#waitGradient)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - waitPct / 100)}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
              <defs>
                <linearGradient id="waitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--accent-bright)" />
                  <stop offset="100%" stopColor="var(--accent)" />
                </linearGradient>
              </defs>
            </svg>
            <div
              className="mono display"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                fontWeight: 700,
              }}
            >
              {secondsLeft > 0 ? secondsLeft : '✓'}
            </div>
          </div>

          <button
            className="btn btn-primary"
            disabled={secondsLeft > 0}
            onClick={confirmTask}
            style={{ width: '100%', padding: '13px' }}
          >
            {secondsLeft > 0 ? 'Please wait…' : "I've completed this"}
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="card" style={{ textAlign: 'center', padding: '36px 28px' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Your single-use key</div>
          <div
            className="mono display"
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 1.5,
              marginBottom: 20,
              padding: '18px 12px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(240, 184, 84, 0.1), rgba(240, 184, 84, 0.03))',
              border: '1px solid rgba(240, 184, 84, 0.25)',
              color: 'var(--gold-bright)',
            }}
          >
            {licenseKey}
          </div>
          <button className="btn btn-gold" onClick={copyKey} style={{ width: '100%', padding: '13px' }}>
            {copiedKey ? '✓ Copied to clipboard' : 'Copy key'}
          </button>
          <p className="text-faint" style={{ fontSize: 12.5, marginTop: 16 }}>
            Paste this into the game's GUI. It can only be used once.
          </p>
          {keyIssuedAt && keyExpiresAt && (
            <div
              className="mono"
              style={{
                fontSize: 11.5,
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--border-soft)',
                color: 'var(--text-faint)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Issued: {new Date(keyIssuedAt).toLocaleString()}</span>
              <span>Expires: {new Date(keyExpiresAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {log.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary className="text-faint mono" style={{ fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>
            Activity log
          </summary>
          <div
            className="mono card"
            style={{
              marginTop: 10,
              fontSize: 11.5,
              color: 'var(--text-dim)',
              background: 'var(--bg-elevated)',
              maxHeight: 160,
              overflowY: 'auto',
            }}
          >
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </details>
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
