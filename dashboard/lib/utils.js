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

module.exports = { generateLicenseKey, applyCors, isRateLimited };
