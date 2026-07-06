const { supabaseAdmin } = require('../../lib/supabaseAdmin');
const { applyCors, isRateLimited } = require('../../lib/utils');

/**
 * POST /api/verify
 * Body: { appApiKey: string, key: string, userId?: number, ... }
 *
 * Called from inside Roblox (HttpService) when the player pastes their
 * key into the GUI. First redemption: atomically checks the key is
 * valid, belongs to the calling app, and hasn't been used yet - then
 * marks it used AND binds it to the redeeming player's userId, all in
 * one atomic update (the eq('used', false) clause makes this a true
 * compare-and-set at the DB level, not a check-then-write race).
 *
 * Every redemption after that: if the SAME userId sends the SAME key
 * again (e.g. they rejoin, or the GUI re-checks on join), this is
 * treated as "welcome back" rather than "already used" - as long as
 * the key hasn't expired yet, it returns valid:true again with the
 * remaining time. A different userId trying the same key is always
 * rejected, so the single-use guarantee against OTHER people still
 * holds; only the original redeemer can keep using their own key until
 * it naturally expires.
 */
export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(`verify:${ip}`, 30, 60_000)) {
    return res.status(429).json({ valid: false, error: 'rate_limited' });
  }

  const { appApiKey, key, executor, isStudio, playerName, accountAgeDays, userId } = req.body || {};
  if (!appApiKey || !key) {
    return res.status(400).json({ valid: false, error: 'missing_fields' });
  }

  const numericUserId = Number.isFinite(Number(userId)) ? Number(userId) : null;

  const { data: app, error: appErr } = await supabaseAdmin
    .from('apps')
    .select('id')
    .eq('api_key', appApiKey)
    .single();

  if (appErr || !app) return res.status(404).json({ valid: false, error: 'app_not_found' });

  const { data: keyRow, error: keyErr } = await supabaseAdmin
    .from('license_keys')
    .select('id, app_id, used, expires_at, created_at, redeemed_by_user_id')
    .eq('key_value', String(key).trim())
    .single();

  if (keyErr || !keyRow) return res.status(404).json({ valid: false, error: 'key_not_found' });
  if (keyRow.app_id !== app.id) return res.status(403).json({ valid: false, error: 'key_wrong_app' });
  if (new Date(keyRow.expires_at) < new Date()) {
    return res.status(410).json({ valid: false, error: 'key_expired' });
  }

  if (keyRow.used) {
    // Already redeemed - only OK if it's the same Roblox account coming
    // back. We require a userId to be present to allow this path at
    // all: an old client that doesn't send userId can never match, so
    // it correctly falls through to "already used" below.
    const isSameOwner =
      numericUserId !== null &&
      keyRow.redeemed_by_user_id !== null &&
      keyRow.redeemed_by_user_id === numericUserId;

    if (!isSameOwner) {
      return res.status(409).json({ valid: false, error: 'key_already_used' });
    }

    return res.status(200).json({
      valid: true,
      returning: true,
      issuedAt: keyRow.created_at,
      expiresAt: keyRow.expires_at,
    });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('license_keys')
    .update({
      used: true,
      used_at: new Date().toISOString(),
      redeemed_by_user_id: numericUserId,
      redeemed_by_username: playerName ? String(playerName).slice(0, 100) : null,
    })
    .eq('id', keyRow.id)
    .eq('used', false)
    .select('id')
    .maybeSingle();

  if (updateErr || !updated) {
    // Someone else's request won the race and redeemed it first.
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

  return res.status(200).json({
    valid: true,
    returning: false,
    issuedAt: keyRow.created_at,
    expiresAt: keyRow.expires_at,
  });
}
