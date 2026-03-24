// background.js — Handles CULPA lookups from the content script.
// Uses the live culpa.info internal API (discovered from the SPA bundle).

const CULPA_BASE = "https://culpa.info";
const CACHE_TTL  = 1000 * 60 * 60 * 24; // 24 h

// Nugget values from culpa.info source: 0=None, 1=Bronze, 2=Silver, 3=Gold
const NUGGET_LABEL = { 0: "None", 1: "Bronze", 2: "Silver", 3: "Gold" };

/* ── Cache helpers (chrome.storage.local) ───────────────── */

async function cacheGet(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, r => {
      const e = r[key];
      resolve(e && Date.now() - e.ts < CACHE_TTL ? e.data : null);
    });
  });
}

async function cacheSet(key, data) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: { data, ts: Date.now() } }, resolve);
  });
}

/* ── CULPA API lookup ────────────────────────────────────── */

async function searchProfessor(first, last) {
  // The SPA calls /api/professor/search?queryString=...&maxResults=...
  const query = encodeURIComponent(`${first} ${last}`);
  const url = `${CULPA_BASE}/api/professor/search?queryString=${query}&maxResults=20`;

  const r = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" }
  });
  if (!r.ok) return null;
  const results = await r.json();
  if (!Array.isArray(results) || !results.length) return null;

  const fl = first.toLowerCase();
  const ll = last.toLowerCase();

  // Exact match first, then last-name-only match
  let match = results.find(item => {
    const ph = item.professor_header;
    return ph.first_name.toLowerCase() === fl &&
           ph.last_name.toLowerCase()  === ll;
  });
  if (!match) {
    match = results.find(item =>
      item.professor_header.last_name.toLowerCase() === ll
    );
  }
  if (!match) match = results[0];

  return match?.professor_header || null;
}

async function getReviewCount(professorId) {
  try {
    const url = `${CULPA_BASE}/api/review/professor/${professorId}?page=1&sort_key=null&course_filter=null`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return 0;
    const j = await r.json();
    return j.number_of_reviews || 0;
  } catch (_) {
    return 0;
  }
}

async function lookupCulpa(first, last) {
  const prof = await searchProfessor(first, last);
  if (!prof) return null;

  const reviewCount = await getReviewCount(prof.professor_id);
  const nuggetNum   = prof.nugget ?? 0;

  return {
    id:          prof.professor_id,
    firstName:   prof.first_name,
    lastName:    prof.last_name,
    nugget:      NUGGET_LABEL[nuggetNum] || "None",
    nuggetNum,
    reviewCount,
    culpaUrl:    `${CULPA_BASE}/professor/${prof.professor_id}`,
    source:      "culpa-api"
  };
}

/* ── Main lookup (with cache) ────────────────────────────── */

async function lookupProfessor(name) {
  const key = `culpa:${name.toLowerCase().trim()}`;
  const cached = await cacheGet(key);
  if (cached) return cached;

  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const first = parts[0];
  const last  = parts[parts.length - 1];

  let result;
  try {
    result = await lookupCulpa(first, last);
  } catch (e) {
    console.log("[CULPA] lookup failed:", e.message);
    result = null;
  }

  if (result) await cacheSet(key, result);
  return result;
}

/* ── Message handler ────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "CULPA_LOOKUP") {
    lookupProfessor(msg.name).then(result => sendResponse({ result }));
    return true;
  }
  if (msg.type === "CULPA_CLEAR_CACHE") {
    chrome.storage.local.clear(() => sendResponse({ ok: true }));
    return true;
  }
});

console.log("[CULPA on Vergil] Service worker ready.");
