const { supabaseAdmin } = require('../../../../lib/supabaseAdmin');
const { ensureOwnerToken } = require('../../../../lib/utils');

/**
 * GET /api/apps/:id/analytics
 *
 * Owner-cookie scoped (same as other /api/apps/:id* routes). Returns
 * aggregated redemption stats for this app's charts:
 *  - executorCounts: { "Roblox": 12, "Synapse X": 3, ... }
 *  - studioVsGame: { studio: n, game: n }
 *  - accountAgeBuckets: { "<30d": n, "30-90d": n, "90-365d": n, "1y+": n }
 *  - recent: last 50 redemptions (player name, executor, studio, age, time)
 *  - total: total redemption count
 */
export default async function handler(req, res) {
  const ownerToken = ensureOwnerToken(req, res);
  const { id } = req.query;

  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const { data: app } = await supabaseAdmin
    .from('apps')
    .select('id')
    .eq('id', id)
    .eq('owner_token', ownerToken)
    .single();

  if (!app) return res.status(404).json({ error: 'not_found' });

  const { data: rows, error } = await supabaseAdmin
    .from('redemptions')
    .select('executor, is_studio, player_name, account_age_days, created_at')
    .eq('app_id', id)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: 'db_error' });

  const executorCounts = {};
  let studioCount = 0;
  let gameCount = 0;
  const ageBuckets = { '<30d': 0, '30-90d': 0, '90-365d': 0, '1y+': 0, unknown: 0 };

  for (const r of rows || []) {
    const ex = r.executor || 'Unknown';
    executorCounts[ex] = (executorCounts[ex] || 0) + 1;

    if (r.is_studio) studioCount++;
    else gameCount++;

    const age = r.account_age_days;
    if (age === null || age === undefined) ageBuckets.unknown++;
    else if (age < 30) ageBuckets['<30d']++;
    else if (age < 90) ageBuckets['30-90d']++;
    else if (age < 365) ageBuckets['90-365d']++;
    else ageBuckets['1y+']++;
  }

  return res.status(200).json({
    total: (rows || []).length,
    executorCounts,
    studioVsGame: { studio: studioCount, game: gameCount },
    accountAgeBuckets: ageBuckets,
    recent: (rows || []).slice(0, 50),
  });
}
