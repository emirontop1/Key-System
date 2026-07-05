const { supabaseAdmin } = require('../../../../lib/supabaseAdmin');
const { applyCors } = require('../../../../lib/utils');

/**
 * GET /api/apps/:id/public-info
 *
 * Unauthenticated, public endpoint used by the /claim/[appId] page before
 * a session starts - just enough info to render "choose how many tasks"
 * (app name + how many tasks exist). Never returns api_key, owner_token,
 * or task contents/links.
 */
export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const { id } = req.query;

  const { data: app, error: appErr } = await supabaseAdmin
    .from('apps')
    .select('id, name')
    .eq('id', id)
    .single();

  if (appErr || !app) return res.status(404).json({ error: 'app_not_found' });

  const { count, error: countErr } = await supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('app_id', id);

  if (countErr) return res.status(500).json({ error: 'db_error' });

  return res.status(200).json({ name: app.name, taskCount: count || 0 });
}
