import express from 'express';
import { createUser, getUsageSummary } from '../services/usageTracking.js';
import { requireUser } from '../services/authMiddleware.js';

const router = express.Router();

/**
 * Creates a new free-plan account and returns its API key.
 * The app calls this once, on first launch, and stores the key locally
 * (e.g. SecureStore) to send as X-User-Api-Key on every /analyze call.
 *
 * When a user later subscribes via Chargily, a webhook handler (added
 * separately once Chargily is integrated) will call setUserPlan() to
 * upgrade this same account — no new key needed.
 */
router.post('/account/signup', express.json(), (req, res) => {
  const { email } = req.body ?? {};
  const user = createUser({ email: email ?? null, plan: 'free' });
  res.status(201).json({ apiKey: user.api_key, plan: user.plan });
});

/** Returns the current user's plan and usage for this billing period. */
router.get('/account/usage', requireUser, (req, res) => {
  res.json(getUsageSummary(req.user));
});

export default router;
