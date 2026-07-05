const { supabaseAdmin } = require('../../lib/supabaseAdmin');
const { applyCors, isRateLimited } = require('../../lib/utils');

/**
 * POST /api/verify
 * Body: { appApiKey: string, key: string }
 *
 * Called from inside Roblox (HttpService) when the player pastes their
 * key into the GUI. Atomically checks the key is valid, belongs to the
 * calling app, and hasn't been used yet - then marks it used in the
 * same update so it can never be redeemed twice, even under concurrent
 * requests (the eq('used', false) clause makes this atomic at the DB
 * level rather than a check-then-write race).
 */
export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(`verify:${ip}`, 30, 60_000)) {
    return res.status(429).json({ valid: false, error: 'rate_limited' });
  }

  const { appApiKey, key, executor, isStudio, playerName, accountAgeDays } = req.body || {};
  if (!appApiKey || !key) {
    return res.status(400).json({ valid: false, error: 'missing_fields' });
  }

  const { data: app, error: appErr } = await supabaseAdmin
    .from('apps')
    .select('id')
    .eq('api_key', appApiKey)
    .single();

  if (appErr || !app) return res.status(404).json({ valid: false, error: 'app_not_found' });

  const { data: keyRow, error: keyErr } = await supabaseAdmin
    .from('license_keys')
    .select('id, app_id, used, expires_at')
    .eq('key_value', String(key).trim())
    .single();

  if (keyErr || !keyRow) return res.status(404).json({ valid: false, error: 'key_not_found' });
  if (keyRow.app_id !== app.id) return res.status(403).json({ valid: false, error: 'key_wrong_app' });
  if (keyRow.used) return res.status(409).json({ valid: false, error: 'key_already_used' });
  if (new Date(keyRow.expires_at) < new Date()) {
    return res.status(410).json({ valid: false, error: 'key_expired' });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('license_keys')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('id', keyRow.id)
    .eq('used', false)
    .select('id')
    .maybeSingle();

  if (updateErr || !updated) {
    return res.status(409).json({ valid: false, error: 'key_already_used' });
  }

  // Analytics is best-effort and informational only - it never affects
  // whether the key is accepted. All fields are optional and self-reported
  // by the Roblox script; a failure here must not fail the verify response,
  // since the player has already validly redeemed their key at this point.
  try {
    await supabaseAdmin.from('redemptions').insert({
      app_id: app.id,
      key_id: keyRow.id,
      executor: executor ? String(executor).slice(0, 100) : null,
      is_studio: !!isStudio,
      player_name: playerName ? String(playerName).slice(0, 100) : null,
      account_age_days: Number.isFinite(Number(accountAgeDays)) ? Number(accountAgeDays) : null,
    });
  } catch (_) {
    // swallow - analytics must never break verification
  }

  return res.status(200).json({ valid: true });
}
