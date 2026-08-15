/**
 * Analysis prompts.
 * ---------------------------------------------------------------
 * Two-pass flow now that a reference image database exists:
 *
 *   Pass 1 (IDENTIFY_PROMPT): ask the model to guess the brand and
 *   product line from the photo/link alone, so the server can look
 *   up matching verified reference images.
 *
 *   Pass 2 (buildComparisonPrompt): if reference images were found,
 *   send them alongside the user's photo and ask the model to compare
 *   directly. If none were found, fall back to the original general
 *   assessment prompt (FALLBACK_PROMPT) — still useful, just without
 *   a verified baseline to compare against.
 *
 * This keeps the system honest: when we truly have a verified
 * reference, the model is told so explicitly and asked to compare
 * against it. When we don't, the result should read as more
 * tentative, and the app should reflect that difference to the user.
 */

export const IDENTIFY_PROMPT = `Look at this product photo and/or link. Identify, as best you can from visible evidence, the likely brand name and product name/line.

Respond ONLY with a JSON object, nothing else:
{
  "brand": "<best-guess brand name, or empty string if unclear>",
  "productName": "<best-guess product name/line, or empty string if unclear>",
  "confidence": "<low|medium|high>"
}`;

export function buildComparisonPrompt({ hasReferenceImages }) {
  const referenceContext = hasReferenceImages
    ? `You have been given the customer's product photo FIRST, followed by ${'{REF_COUNT}'} verified authentic reference image(s) of the same product line for direct comparison. Compare the customer's photo against these verified references specifically — logo shape, proportions, stitching, materials, packaging, and any other visible detail. Because you have real verified references here, you can speak with more confidence than usual, though you should still never claim certainty a photo alone can't support.`
    : `No verified reference images were available for this specific product, so base your assessment on general knowledge of authentic vs. counterfeit indicators for this category. Be appropriately more cautious in your confidence than you would be with a direct reference comparison.`;

  return `You are a product authenticity and condition assessor for a consumer app called AuthCheck.

${referenceContext}

Assess two things:
1. Likely authenticity (authentic / uncertain / likely counterfeit)
2. Likely condition (new / used / unclear)

Ground every judgment ONLY in visible evidence: logo shape and spacing, font choices, stitching or seam quality, material texture, packaging details, print sharpness, color accuracy, and (if provided) price relative to the known typical retail price for that item.

Never state something is "confirmed authentic" — you can only say a product is consistent or inconsistent with authentic references, since you cannot perform a physical inspection.

Respond ONLY with a JSON object in exactly this shape, and nothing else — no markdown fences, no preamble:

{
  "score": <integer 0-100, where 0-44 = likely counterfeit, 45-74 = uncertain, 75-100 = likely authentic>,
  "verdict": "<authentic|caution|counterfeit>",
  "condition": "<new|used|unclear>",
  "reasons": ["<short factual reason>", "<short factual reason>", "<short factual reason>"],
  "usedVerifiedReferences": ${hasReferenceImages}
}

Give 2-4 reasons, each one specific observation (not generic statements like "looks fine"). Reasons should be understandable to a non-expert shopper.`;
}

export function parseJsonResponse(rawText) {
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Model did not return parseable JSON');
  }
  return JSON.parse(jsonMatch[0]);
}

export function parseAnalysisResponse(rawText) {
  const parsed = parseJsonResponse(rawText);

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
  const verdict = ['authentic', 'caution', 'counterfeit'].includes(parsed.verdict)
    ? parsed.verdict
    : deriveVerdictFromScore(score);
  const condition = ['new', 'used', 'unclear'].includes(parsed.condition)
    ? parsed.condition
    : 'unclear';
  const reasons =
    Array.isArray(parsed.reasons) && parsed.reasons.length > 0
      ? parsed.reasons.slice(0, 4).map(String)
      : ['No specific details could be extracted from the provided image.'];
  const usedVerifiedReferences = Boolean(parsed.usedVerifiedReferences);

  return { score, verdict, condition, reasons, usedVerifiedReferences };
}

function deriveVerdictFromScore(score) {
  if (score >= 75) return 'authentic';
  if (score >= 45) return 'caution';
  return 'counterfeit';
}
