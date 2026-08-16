import { findUserByApiKey } from './usageTracking.js';

/**
 * Identifies the calling app user via the X-User-Api-Key header.
 * This is the per-user key issued at signup (see usageTracking.createUser),
 * NOT the Anthropic API key — that one stays server-side only.
 */
export function requireUser(req, res, next) {
  const apiKey = req.headers['x-user-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-User-Api-Key header.' });
  }

  const user = findUserByApiKey(apiKey);
  if (!user) {
    return res.status(401).json({ error: 'Invalid API key.' });
  }

  req.user = user;
  next();
}
