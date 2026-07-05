const { supabaseAdmin } = require('../../../lib/supabaseAdmin');
const { ensureOwnerToken } = require('../../../lib/utils');

/**
 * GET  /api/apps   -> list apps owned by this browser (owner_token cookie)
 * POST /api/apps   -> create a new app owned by this browser
 *
 * There's no login: the first request from a browser gets a random
 * owner_token minted into an httpOnly cookie. Every app created from
 * that browser is tagged with that token. Only requests carrying the
 * matching cookie can see or manage those apps.
 */
export default async function handler(req, res) {
  const ownerToken = ensureOwnerToken(req, res);

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('apps')
      .select('id, name, api_key, created_at')
      .eq('owner_token', ownerToken)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'db_error' });
    return res.status(200).json({ apps: data || [] });
  }

  if (req.method === 'POST') {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name_required' });
    }

    const { data, error } = await supabaseAdmin
      .from('apps')
      .insert({ name: name.trim(), owner_token: ownerToken })
      .select('id, name, api_key, created_at')
      .single();

    if (error) return res.status(500).json({ error: 'db_error' });
    return res.status(200).json({ app: data });
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
