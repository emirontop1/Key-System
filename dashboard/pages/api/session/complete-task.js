const { supabaseAdmin } = require('../../../lib/supabaseAdmin');
const { applyCors, isRateLimited } = require('../../../lib/utils');

/**
 * POST /api/session/complete-task
 * Body: { sessionToken: string, taskId: string, startedAt: number (ms epoch) }
 *
 * Called after the wait page's countdown finishes. Re-checks server-side
 * that enough time has elapsed since the task was opened, so a player
 * can't fire this instantly from devtools without waiting out the timer.
 */
export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(`complete:${ip}`, 60, 60_000)) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  const { sessionToken, taskId, startedAt } = req.body || {};
  if (!sessionToken || !taskId || !startedAt) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const { data: session, error: sessErr } = await supabaseAdmin
    .from('key_sessions')
    .select('id, app_id, completed, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessErr || !session) return res.status(404).json({ error: 'session_not_found' });
  if (new Date(session.expires_at) < new Date()) {
    return res.status(410).json({ error: 'session_expired' });
  }

  const { data: task, error: taskErr } = await supabaseAdmin
    .from('tasks')
    .select('id, wait_seconds, app_id')
    .eq('id', taskId)
    .single();

  if (taskErr || !task || task.app_id !== session.app_id) {
    return res.status(404).json({ error: 'task_not_found' });
  }

  const elapsedSeconds = (Date.now() - Number(startedAt)) / 1000;
  if (elapsedSeconds < task.wait_seconds) {
    return res.status(400).json({ error: 'wait_not_elapsed' });
  }

  const { error: insertErr } = await supabaseAdmin
    .from('task_completions')
    .upsert(
      { session_id: session.id, task_id: task.id },
      { onConflict: 'session_id,task_id', ignoreDuplicates: true }
    );

  if (insertErr) return res.status(500).json({ error: 'failed_to_record_completion' });

  const { data: allTasks } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('app_id', session.app_id);

  const { data: completions } = await supabaseAdmin
    .from('task_completions')
    .select('task_id')
    .eq('session_id', session.id);

  const allDone = (allTasks || []).every((t) =>
    (completions || []).some((c) => c.task_id === t.id)
  );

  if (allDone && !session.completed) {
    await supabaseAdmin
      .from('key_sessions')
      .update({ completed: true })
      .eq('id', session.id);
  }

  return res.status(200).json({
    completedCount: (completions || []).length,
    totalCount: (allTasks || []).length,
    allDone,
  });
}
