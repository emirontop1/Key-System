const { supabaseAdmin } = require('../../../../lib/supabaseAdmin');
const { ensureOwnerToken } = require('../../../../lib/utils');

async function assertOwnsApp(appId, ownerToken) {
  const { data } = await supabaseAdmin
    .from('apps')
    .select('id')
    .eq('id', appId)
    .eq('owner_token', ownerToken)
    .single();
  return !!data;
}

/**
 * GET    /api/apps/:id/packages         -> list packages for this app
 * POST   /api/apps/:id/packages         -> create a package
 * DELETE /api/apps/:id/packages?packageId= -> remove a package
 *
 * A "package" is a (duration_hours, task_count) combo the app owner
 * defines, e.g. "24 Hour Key" = 24h / 2 tasks. Players choose one of
 * these on the claim page; the resulting license key's expiry and the
 * number of random tasks assigned both come from the chosen package.
 */
export default async function handler(req, res) {
  const ownerToken = ensureOwnerToken(req, res);
  const { id } = req.query;

  const owns = await assertOwnsApp(id, ownerToken);
  if (!owns) return res.status(404).json({ error: 'not_found' });

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('key_packages')
      .select('id, label, duration_hours, task_count, order_index')
      .eq('app_id', id)
      .order('order_index', { ascending: true });

    if (error) return res.status(500).json({ error: 'db_error' });
    return res.status(200).json({ packages: data || [] });
  }

  if (req.method === 'POST') {
    const { label, duration_hours, task_count } = req.body || {};
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'label_required' });
    }
    const hours = Math.floor(Number(duration_hours));
    if (!Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({ error: 'invalid_duration' });
    }
    const count = Math.max(0, Math.floor(Number(task_count) || 0));

    const { count: existingCount } = await supabaseAdmin
      .from('key_packages')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', id);

    const { data, error } = await supabaseAdmin
      .from('key_packages')
      .insert({
        app_id: id,
        label: label.trim(),
        duration_hours: hours,
        task_count: count,
        order_index: existingCount || 0,
      })
      .select('id, label, duration_hours, task_count, order_index')
      .single();

    if (error) return res.status(500).json({ error: 'db_error' });
    return res.status(200).json({ package: data });
  }

  if (req.method === 'DELETE') {
    const { packageId } = req.query;
    if (!packageId) return res.status(400).json({ error: 'package_id_required' });

    const { error } = await supabaseAdmin
      .from('key_packages')
      .delete()
      .eq('id', packageId)
      .eq('app_id', id);

    if (error) return res.status(500).json({ error: 'db_error' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
