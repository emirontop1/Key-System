const { supabaseAdmin } = require('../../../../lib/supabaseAdmin');
const { applyCors } = require('../../../../lib/utils');

/**
 * GET /api/apps/:id/public-packages
 *
 * Unauthenticated, public endpoint used by the /claim/[appId] page
 * before a session starts, to render "choose your key duration."
 * Never returns api_key, owner_token, or task contents/links.
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

  const { data: packages, error: pkgErr } = await supabaseAdmin
    .from('key_packages')
    .select('id, label, duration_hours, task_count')
    .eq('app_id', id)
    .order('order_index', { ascending: true });

  if (pkgErr) return res.status(500).json({ error: 'db_error' });

  return res.status(200).json({ name: app.name, packages: packages || [] });
}
