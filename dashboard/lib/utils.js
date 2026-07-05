const crypto = require('crypto');

/**
 * Generates a human-friendly license key like: XKEY-4F9A-7B2C-9D1E
 */
function generateLicenseKey() {
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `XKEY-${part()}-${part()}-${part()}`;
}

/**
 * Applies permissive CORS headers so the Roblox HttpService (which sends no
 * Origin header) and the dashboard's own frontend can both call the API.
 */
function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Simple in-memory rate limiter per serverless instance. Not perfectly
 * distributed across cold starts/regions, but blunts naive brute-force
 * attempts against /api/verify without adding external infra.
 */
const hits = new Map();
function isRateLimited(key, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const entry = hits.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  hits.set(key, entry);
  return entry.count > limit;
}

const OWNER_COOKIE_NAME = 'ks_owner';

/**
 * Reads the owner_token cookie from an incoming request, if present.
 */
function getOwnerTokenFromReq(req) {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${OWNER_COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/**
 * Ensures the response carries an owner_token cookie, generating a new
 * random one if the request didn't already have one. Returns the token
 * that should be used for this request (existing or freshly generated).
 * Cookie is httpOnly (JS on the page can't read/steal it), 1 year expiry,
 * SameSite=Lax (works for normal same-site navigation/fetch).
 */
function ensureOwnerToken(req, res) {
  let token = getOwnerTokenFromReq(req);
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.setHeader(
      'Set-Cookie',
      `${OWNER_COOKIE_NAME}=${token}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; SameSite=Lax`
    );
  }
  return token;
}

module.exports = {
  generateLicenseKey,
  applyCors,
  isRateLimited,
  getOwnerTokenFromReq,
  ensureOwnerToken,
};
