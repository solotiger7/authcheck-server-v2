/**
 * Pricing plans.
 * --------------------------------------------------------------
 * Each plan has a monthly included scan quota. Once a user exceeds
 * their quota, they are NOT blocked — the scan still goes through,
 * but is tagged as "overage" and billed at the plan's per-scan rate.
 * This avoids ever cutting off a paying customer mid-month.
 *
 * Prices are in USD. Adjust once real usage data confirms actual
 * Anthropic API cost per scan (currently estimated well below the
 * overage rate, which is what keeps this profitable at scale).
 */

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    monthlyPriceUSD: 0,
    includedScans: 5,
    overagePerScanUSD: null, // free plan cannot overage — must upgrade
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    monthlyPriceUSD: 5,
    includedScans: 200,
    overagePerScanUSD: 0.05,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPriceUSD: 20,
    includedScans: 1000,
    overagePerScanUSD: 0.03,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPriceUSD: null, // custom / negotiated
    includedScans: null, // effectively unlimited, custom contract
    overagePerScanUSD: 0.02,
  },
};

export function getPlan(planId) {
  return PLANS[planId] ?? PLANS.free;
}
