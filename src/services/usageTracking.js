import { db } from '../db/index.js';
import { getPlan } from '../plans.js';
import crypto from 'node:crypto';

/** Current billing period key, e.g. "2026-08". Matches calendar months for now. */
function currentPeriodKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function findUserByApiKey(apiKey) {
  return db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey);
}

/**
 * Creates a new user on a given plan (default: free) and returns their
 * API key. In production this is called when someone signs up / a
 * subscription webhook confirms payment — not exposed as a public
 * unauthenticated endpoint beyond what's needed for onboarding.
 */
export function createUser({ email = null, plan = 'free' } = {}) {
  const apiKey = `ak_${crypto.randomBytes(24).toString('hex')}`;
  const info = db
    .prepare('INSERT INTO users (api_key, email, plan) VALUES (?, ?, ?)')
    .run(apiKey, email, plan);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

export function setUserPlan(userId, plan) {
  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);
}

function getOrCreatePeriodRow(userId) {
  const periodKey = currentPeriodKey();
  const existing = db
    .prepare('SELECT * FROM usage_periods WHERE user_id = ? AND period_key = ?')
    .get(userId, periodKey);
  if (existing) return existing;

  const info = db
    .prepare(
      `INSERT INTO usage_periods (user_id, period_key, included_scans_used, overage_scans_used)
       VALUES (?, ?, 0, 0)`
    )
    .run(userId, periodKey);
  return db.prepare('SELECT * FROM usage_periods WHERE id = ?').get(info.lastInsertRowid);
}

/**
 * Checks whether a user is allowed to make a scan right now.
 *
 * Returns:
 *   { allowed: true, isOverage: false }              -- within included quota
 *   { allowed: true, isOverage: true, rate }          -- over quota, billable overage
 *   { allowed: false, reason }                        -- free plan, quota exhausted
 *
 * IMPORTANT: paying plans (basic/pro/enterprise) are NEVER blocked —
 * only the free plan can be blocked once its quota is used up, since
 * free users have no billing relationship to charge overage against.
 */
export function checkUsageAllowance(user) {
  const plan = getPlan(user.plan);
  const period = getOrCreatePeriodRow(user.id);
  const totalUsed = period.included_scans_used + period.overage_scans_used;

  if (plan.includedScans === null) {
    // Enterprise / effectively unlimited included quota.
    return { allowed: true, isOverage: false };
  }

  if (totalUsed < plan.includedScans) {
    return { allowed: true, isOverage: false };
  }

  if (plan.overagePerScanUSD === null) {
    // Free plan with no overage option — must upgrade.
    return {
      allowed: false,
      reason: 'Free plan monthly scan limit reached. Upgrade to continue scanning.',
    };
  }

  return { allowed: true, isOverage: true, rate: plan.overagePerScanUSD };
}

/** Records one completed scan against the user's current billing period. */
export function recordScan(user, { isOverage }) {
  const period = getOrCreatePeriodRow(user.id);
  if (isOverage) {
    db.prepare(
      'UPDATE usage_periods SET overage_scans_used = overage_scans_used + 1 WHERE id = ?'
    ).run(period.id);
  } else {
    db.prepare(
      'UPDATE usage_periods SET included_scans_used = included_scans_used + 1 WHERE id = ?'
    ).run(period.id);
  }
}

/** Returns a usage summary for display in the app (e.g. "42 / 200 scans used"). */
export function getUsageSummary(user) {
  const plan = getPlan(user.plan);
  const period = getOrCreatePeriodRow(user.id);
  return {
    plan: plan.id,
    planName: plan.name,
    includedScans: plan.includedScans,
    includedScansUsed: period.included_scans_used,
    overageScansUsed: period.overage_scans_used,
    overagePerScanUSD: plan.overagePerScanUSD,
    periodKey: period.period_key,
  };
}
