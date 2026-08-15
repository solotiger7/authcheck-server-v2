/**
 * Live reference image search.
 * --------------------------------------------------------------
 * Fetches candidate reference images for a brand/product AT REQUEST TIME
 * via a licensed image search API, holds them in memory only for the
 * duration of that single request, and discards them immediately after.
 * Nothing is written to disk and nothing is cached long-term.
 *
 * Requires a Bing Image Search API key (Azure Cognitive Services) or a
 * Google Custom Search API key+CX — both are official, licensed APIs
 * with their own terms of use. Set ONE of these in your .env:
 *
 *   BING_IMAGE_SEARCH_KEY=...
 *   or
 *   GOOGLE_CSE_KEY=...
 *   GOOGLE_CSE_CX=...
 *
 * IMPORTANT: using search-API results for transient in-request
 * comparison is a more defensible pattern than storing them, but it
 * is not a blanket legal clearance — each search API's own terms of
 * service govern what you're allowed to do with results, and
 * trademark/copyright considerations still apply if this becomes a
 * commercial product at scale. Not legal advice.
 */

const MAX_IMAGES = 3;
const FETCH_TIMEOUT_MS = 8000;

export async function fetchLiveReferenceImages({ brand, productName }) {
  if (!brand) return [];

  const query = [brand, productName].filter(Boolean).join(' ') + ' official product photo';

  let imageUrls = [];
  if (process.env.BING_IMAGE_SEARCH_KEY) {
    imageUrls = await searchViaBing(query);
  } else if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) {
    imageUrls = await searchViaGoogleCSE(query);
  } else {
    console.warn(
      'No image search API configured (BING_IMAGE_SEARCH_KEY or GOOGLE_CSE_KEY/CX). ' +
        'Live reference lookup skipped — falling back to general assessment.'
    );
    return [];
  }

  const images = await Promise.all(
    imageUrls.slice(0, MAX_IMAGES).map(async (url) => {
      try {
        const buffer = await fetchImageBuffer(url);
        return buffer ? { url, buffer } : null;
      } catch {
        return null;
      }
    })
  );

  // In-memory only — this array (and the buffers inside it) goes out of
  // scope and is garbage-collected once the request finishes. Nothing here
  // touches the filesystem or a database.
  return images.filter(Boolean);
}

async function searchViaBing(query) {
  const res = await fetch(
    `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&count=${MAX_IMAGES}&safeSearch=Strict`,
    { headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_IMAGE_SEARCH_KEY } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.value ?? []).map((item) => item.contentUrl);
}

async function searchViaGoogleCSE(query) {
  const params = new URLSearchParams({
    key: process.env.GOOGLE_CSE_KEY,
    cx: process.env.GOOGLE_CSE_CX,
    q: query,
    searchType: 'image',
    num: String(MAX_IMAGES),
    safe: 'active',
  });
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((item) => item.link);
}

async function fetchImageBuffer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const arrayBuffer = await res.arrayBuffer();
    return { data: Buffer.from(arrayBuffer), mimeType: contentType };
  } finally {
    clearTimeout(timeout);
  }
}
