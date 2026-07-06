const { supabaseAdmin } = require('../../../lib/supabaseAdmin');
const { ensureOwnerToken } = require('../../../lib/utils');

/**
 * GET   /api/apps/:id -> app details + its tasks, ONLY if this browser's
 *       owner_token cookie matches the app's owner_token. Otherwise 404 -
 *       same response whether the app doesn't exist or just isn't yours,
 *       so the API doesn't leak which app IDs exist.
 * PATCH /api/apps/:id -> update app settings (currently just task_count:
 *       how many randomly-picked tasks a player must complete).
 * DELETE /api/apps/:id -> permanently delete the app and everything
 *       under it (tasks, key packages, sessions, license keys,
 *       redemption analytics) via ON DELETE CASCADE in the schema.
 */
export default async function handler(req, res) {
  const ownerToken = ensureOwnerToken(req, res);
  const { id } = req.query;

  if (req.method === 'GET') {
    const { data: app, error: appErr } = await supabaseAdmin
      .from('apps')
      .select('id, name, api_key, task_count, created_at')
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

  if (req.method === 'PATCH') {
    const { data: existing } = await supabaseAdmin
      .from('apps')
      .select('id')
      .eq('id', id)
      .eq('owner_token', ownerToken)
      .single();

    if (!existing) return res.status(404).json({ error: 'not_found' });

    const { task_count } = req.body || {};
    const count = Math.max(0, Math.floor(Number(task_count) || 0));

    const { data: updated, error } = await supabaseAdmin
      .from('apps')
      .update({ task_count: count })
      .eq('id', id)
      .select('id, name, api_key, task_count, created_at')
      .single();

    if (error) return res.status(500).json({ error: 'db_error' });
    return res.status(200).json({ app: updated });
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabaseAdmin
      .from('apps')
      .select('id')
      .eq('id', id)
      .eq('owner_token', ownerToken)
      .single();

    if (!existing) return res.status(404).json({ error: 'not_found' });

    const { error } = await supabaseAdmin.from('apps').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'db_error' });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
