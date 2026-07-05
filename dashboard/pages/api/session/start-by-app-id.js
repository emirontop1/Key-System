const { supabaseAdmin } = require('../../../lib/supabaseAdmin');
const { applyCors, isRateLimited } = require('../../../lib/utils');

/**
 * Fisher-Yates shuffle - unbiased random ordering, used to pick a random
 * subset of tasks without favoring any position.
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * POST /api/session/start-by-app-id
 * Body: { appId: string, requestedCount?: number }
 *
 * Used by the public /claim/[appId] page. Keyed by the app's public id,
 * never its Roblox-facing api_key (that stays secret, embedded only in
 * the game script, and is used solely by /api/verify).
 *
 * requestedCount: how many tasks the player wants to do. If omitted (or
 * >= total tasks), all tasks are used. Otherwise a random subset of that
 * size is picked and LOCKED into the session (assigned_task_ids) so the
 * player can't dodge hard tasks by refreshing, and can't be asked to
 * complete tasks outside the set they were shown.
 */
export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(`start-by-id:${ip}`, 30, 60_000)) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  const { appId, requestedCount } = req.body || {};
  if (!appId) return res.status(400).json({ error: 'missing_app_id' });

  const { data: app, error: appErr } = await supabaseAdmin
    .from('apps')
    .select('id, name')
    .eq('id', appId)
    .single();

  if (appErr || !app) return res.status(404).json({ error: 'app_not_found' });

  const { data: allTasks, error: tasksErr } = await supabaseAdmin
    .from('tasks')
    .select('id, title, url, wait_seconds, order_index')
    .eq('app_id', app.id)
    .order('order_index', { ascending: true });

  if (tasksErr) return res.status(500).json({ error: 'failed_to_load_tasks' });
  if (!allTasks || allTasks.length === 0) {
    return res.status(400).json({ error: 'app_has_no_tasks' });
  }

  // Clamp requested count into [1, total tasks] - this is the "lock to
  // max if they ask for more than exist" behavior.
  const total = allTasks.length;
  let count = Number(requestedCount);
  if (!Number.isFinite(count) || count < 1) count = total;
  count = Math.min(count, total);

  const chosen = count >= total ? allTasks : shuffle(allTasks).slice(0, count);
  const chosenIds = chosen.map((t) => t.id);
  // Keep the player-facing order stable/sensible (by original order_index)
  // rather than shuffle order, even though the SUBSET is random.
  const orderedChosen = allTasks.filter((t) => chosenIds.includes(t.id));

  const { data: session, error: sessErr } = await supabaseAdmin
    .from('key_sessions')
    .insert({
      app_id: app.id,
      requested_count: count,
      assigned_task_ids: chosenIds,
    })
    .select('id, session_token, expires_at')
    .single();

  if (sessErr) return res.status(500).json({ error: 'failed_to_create_session' });

  return res.status(200).json({
    appName: app.name,
    sessionToken: session.session_token,
    expiresAt: session.expires_at,
    totalTasksAvailable: total,
    tasks: orderedChosen.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      waitSeconds: t.wait_seconds,
    })),
  });
}
