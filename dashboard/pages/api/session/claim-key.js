const { supabaseAdmin } = require('../../../lib/supabaseAdmin');
const { applyCors, isRateLimited, generateLicenseKey } = require('../../../lib/utils');

/**
 * POST /api/session/claim-key
 * Body: { sessionToken: string }
 *
 * Issues exactly one license key per completed session. Safe to call
 * multiple times - if a key already exists for this session, it is
 * returned again instead of minting a second one.
 */
export default async function handler(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(`claim:${ip}`, 15, 60_000)) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  const { sessionToken } = req.body || {};
  if (!sessionToken) return res.status(400).json({ error: 'missing_session_token' });

  const { data: session, error: sessErr } = await supabaseAdmin
    .from('key_sessions')
    .select('id, app_id, completed, expires_at, duration_hours')
    .eq('session_token', sessionToken)
    .single();

  if (sessErr || !session) return res.status(404).json({ error: 'session_not_found' });
  if (new Date(session.expires_at) < new Date()) {
    return res.status(410).json({ error: 'session_expired' });
  }
  if (!session.completed) {
    return res.status(400).json({ error: 'tasks_not_complete' });
  }

  const { data: existingKey } = await supabaseAdmin
    .from('license_keys')
    .select('key_value, created_at, expires_at')
    .eq('session_id', session.id)
    .maybeSingle();

  if (existingKey) {
    return res.status(200).json({
      key: existingKey.key_value,
      issuedAt: existingKey.created_at,
      expiresAt: existingKey.expires_at,
    });
  }

  const durationHours = Number(session.duration_hours) || 24;
  const issuedAt = new Date();
  const keyExpiresAt = new Date(issuedAt.getTime() + durationHours * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 3; attempt++) {
    const keyValue = generateLicenseKey();
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('license_keys')
      .insert({
        app_id: session.app_id,
        session_id: session.id,
        key_value: keyValue,
        expires_at: keyExpiresAt.toISOString(),
      })
      .select('key_value, created_at, expires_at')
      .single();

    if (!insertErr) {
      return res.status(200).json({
        key: inserted.key_value,
        issuedAt: inserted.created_at,
        expiresAt: inserted.expires_at,
      });
    }
  }

  return res.status(500).json({ error: 'failed_to_issue_key' });
}
