import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

export default function ClaimPage() {
  const router = useRouter();
  const { appId } = router.query;

  const [phase, setPhase] = useState('loading'); // loading | choose_count | tasks | waiting | done | error
  const [appName, setAppName] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [tasks, setTasks] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [log, setLog] = useState([]);
  const [licenseKey, setLicenseKey] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [totalAvailable, setTotalAvailable] = useState(null);
  const [requestedCount, setRequestedCount] = useState(5);
  const startedAtRef = useRef(null);

  useEffect(() => {
    if (!appId) return;
    // First, just peek at how many tasks this app has so the player can
    // choose a sensible number - doesn't start a session yet.
    fetchTaskCount();
  }, [appId]);

  async function fetchTaskCount() {
    try {
      const res = await fetch(`${API_BASE}/api/apps/${appId}/public-info`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setAppName(data.name);
      setTotalAvailable(data.taskCount);
      setRequestedCount(Math.min(5, data.taskCount) || 1);
      setPhase('choose_count');
    } catch (err) {
      setErrorMsg('Could not load this app. The link may be invalid.');
      setPhase('error');
    }
  }

  function pushLog(line) {
    setLog((prev) => [...prev, line]);
  }

  async function startSession() {
    setPhase('loading');
    try {
      const clamped = Math.max(1, Math.min(requestedCount, totalAvailable || requestedCount));
      const res = await fetch(`${API_BASE}/api/session/start-by-app-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, requestedCount: clamped }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed_to_start');

      setAppName(data.appName);
      setSessionToken(data.sessionToken);
      setTasks(data.tasks);
      pushLog(`[i] session started for ${data.appName} — ${data.tasks.length} task(s) assigned`);
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
      pushLog(`[✓] key issued`);
      setPhase('done');
    } else {
      setErrorMsg('Could not issue key. Please refresh and try again.');
      setPhase('error');
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(licenseKey);
  }

  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 560 }}>
      <div className="mono text-dim" style={{ fontSize: 13, letterSpacing: 1, marginBottom: 8 }}>
        KEY-SYSTEM
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 24px' }}>
        {appName || 'Loading…'}
      </h1>

      {phase === 'error' && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <p style={{ margin: 0 }}>{errorMsg}</p>
        </div>
      )}

      {phase === 'choose_count' && (
        <div className="card">
          <p className="text-dim" style={{ marginTop: 0, fontSize: 13 }}>
            This app has {totalAvailable} task{totalAvailable === 1 ? '' : 's'} available.
            Choose how many you want to complete — a random selection of
            that many will be picked for you.
          </p>
          <div className="field">
            <label>How many tasks?</label>
            <input
              type="number"
              min={1}
              max={totalAvailable || 1}
              value={requestedCount}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRequestedCount(Number.isFinite(v) ? v : 1);
              }}
            />
          </div>
          <p className="text-dim" style={{ fontSize: 12, marginTop: -6 }}>
            {requestedCount > (totalAvailable || 1)
              ? `Locked to the maximum of ${totalAvailable}.`
              : `\u00A0`}
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={startSession}>
            Start
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
                  opacity: done ? 0.5 : 1,
                }}
              >
                <div>
                  <span className="mono text-dim" style={{ fontSize: 12, marginRight: 10 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {t.title}
                </div>
                {done ? (
                  <span className="badge badge-success">done</span>
                ) : (
                  <button className="btn btn-primary" onClick={() => openTask(t)}>
                    Start
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {phase === 'waiting' && activeTask && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-dim" style={{ marginBottom: 4 }}>Waiting for</p>
          <p style={{ fontWeight: 600, marginTop: 0 }}>{activeTask.title}</p>
          <div className="mono" style={{ fontSize: 40, fontWeight: 700, margin: '16px 0' }}>
            {secondsLeft > 0 ? secondsLeft : '0'}
          </div>
          <button
            className="btn btn-primary"
            disabled={secondsLeft > 0}
            onClick={confirmTask}
            style={{ width: '100%' }}
          >
            {secondsLeft > 0 ? 'Please wait…' : "I've completed this"}
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="text-dim" style={{ marginBottom: 10 }}>Your single-use key</p>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>
            {licenseKey}
          </div>
          <button className="btn btn-primary" onClick={copyKey} style={{ width: '100%' }}>
            Copy key
          </button>
          <p className="text-dim" style={{ fontSize: 12, marginTop: 14 }}>
            Paste this into the game's GUI. It can only be used once.
          </p>
        </div>
      )}

      {log.length > 0 && (
        <div
          className="mono card"
          style={{
            marginTop: 24,
            fontSize: 12,
            color: 'var(--text-dim)',
            background: '#0a0c10',
            maxHeight: 160,
            overflowY: 'auto',
          }}
        >
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
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
