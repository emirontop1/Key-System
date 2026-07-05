const { supabaseAdmin } = require('../../../../lib/supabaseAdmin');
const { ensureOwnerToken } = require('../../../../lib/utils');

/**
 * Confirms the calling browser owns app :id before allowing any task
 * mutation. Every handler below re-checks this - never trust the
 * app_id alone.
 */
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
 * POST   /api/apps/:id/tasks         -> add a task
 * DELETE /api/apps/:id/tasks?taskId= -> remove a task
 */
export default async function handler(req, res) {
  const ownerToken = ensureOwnerToken(req, res);
  const { id } = req.query;

  const owns = await assertOwnsApp(id, ownerToken);
  if (!owns) return res.status(404).json({ error: 'not_found' });

  if (req.method === 'POST') {
    const { title, url, wait_seconds } = req.body || {};
    if (!title || !title.trim() || !url || !url.trim()) {
      return res.status(400).json({ error: 'title_and_url_required' });
    }

    const wait = Math.min(120, Math.max(3, Number(wait_seconds) || 15));

    const { count } = await supabaseAdmin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', id);

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        app_id: id,
        title: title.trim(),
        url: url.trim(),
        wait_seconds: wait,
        order_index: count || 0,
      })
      .select('id, title, url, wait_seconds, order_index')
      .single();

    if (error) return res.status(500).json({ error: 'db_error' });
    return res.status(200).json({ task: data });
  }

  if (req.method === 'DELETE') {
    const { taskId } = req.query;
    if (!taskId) return res.status(400).json({ error: 'task_id_required' });

    const { error } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .eq('app_id', id);

    if (error) return res.status(500).json({ error: 'db_error' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
