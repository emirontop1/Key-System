const { supabaseAdmin } = require('../../../lib/supabaseAdmin');
const { ensureOwnerToken } = require('../../../lib/utils');

/**
 * GET /api/apps/:id -> app details + its tasks, ONLY if this browser's
 * owner_token cookie matches the app's owner_token. Otherwise 404 -
 * same response whether the app doesn't exist or just isn't yours, so
 * the API doesn't leak which app IDs exist.
 */
export default async function handler(req, res) {
  const ownerToken = ensureOwnerToken(req, res);
  const { id } = req.query;

  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const { data: app, error: appErr } = await supabaseAdmin
    .from('apps')
    .select('id, name, api_key, created_at')
    .eq('id', id)
    .eq('owner_token', ownerToken)
    .single();

  if (appErr || !app) return res.status(404).json({ error: 'not_found' });

  const { data: tasks, error: taskErr } = await supabaseAdmin
    .from('tasks')
    .select('id, title, url, wait_seconds, order_index')
    .eq('app_id', id)
    .order('order_index', { ascending: true });

  if (taskErr) return res.status(500).json({ error: 'db_error' });

  return res.status(200).json({ app, tasks: tasks || [] });
}
