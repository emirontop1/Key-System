const { supabaseAdmin } = require('../../../lib/supabaseAdmin');
const { applyCors, isRateLimited } = require('../../../lib/utils');

/**
 * POST /api/session/start-by-app-id
 * Body: { appId: string }
 *
 * Used by the public /claim/[appId] page. Keyed by the app's public id,
 * never its Roblox-facing api_key (that stays secret, embedded only in
 * the game script, and is used solely by /api/verify).
 */
export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(`start-by-id:${ip}`, 30, 60_000)) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  const { appId } = req.body || {};
  if (!appId) return res.status(400).json({ error: 'missing_app_id' });

  const { data: app, error: appErr } = await supabaseAdmin
    .from('apps')
    .select('id, name')
    .eq('id', appId)
    .single();

  if (appErr || !app) return res.status(404).json({ error: 'app_not_found' });

  const { data: tasks, error: tasksErr } = await supabaseAdmin
    .from('tasks')
    .select('id, title, url, wait_seconds, order_index')
    .eq('app_id', app.id)
    .order('order_index', { ascending: true });

  if (tasksErr) return res.status(500).json({ error: 'failed_to_load_tasks' });

  const { data: session, error: sessErr } = await supabaseAdmin
    .from('key_sessions')
    .insert({ app_id: app.id })
    .select('id, session_token, expires_at')
    .single();

  if (sessErr) return res.status(500).json({ error: 'failed_to_create_session' });

  return res.status(200).json({
    appName: app.name,
    sessionToken: session.session_token,
    expiresAt: session.expires_at,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      waitSeconds: t.wait_seconds,
    })),
  });
}
