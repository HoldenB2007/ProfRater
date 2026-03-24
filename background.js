// background.js — Handles CULPA lookups from the content script.
// Strategy: try api.culpa.info first, fall back to culpa.info internal API probing,
//           and finally provide a direct search link as a last resort.

const CULPA_API  = "http://api.culpa.info";
const CULPA_SITE = "https://culpa.info";
const CACHE_TTL  = 1000 * 60 * 60 * 24; // 24 h

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

/* ── Strategy 1 — Official REST API ─────────────────────── */

async function tryAPI(first, last) {
  try {
    const r = await fetch(
      `${CULPA_API}/professors/search/${encodeURIComponent(last)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (j.status !== "success" || !j.professors?.length) return null;

    let m = j.professors.find(p =>
      p.first_name.toLowerCase() === first.toLowerCase() &&
      p.last_name.toLowerCase()  === last.toLowerCase()
    );
    if (!m) m = j.professors.find(p =>
      p.last_name.toLowerCase() === last.toLowerCase()
    );
    if (!m) return null;

    // Fetch reviews (best effort)
    let reviews = [];
    try {
      const rv = await fetch(
        `${CULPA_API}/reviews/professor_id/${m.id}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (rv.ok) {
        const rj = await rv.json();
        if (rj.status === "success") reviews = rj.reviews || [];
      }
    } catch (_) {}

    return {
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      nugget: m.nugget || "None",
      reviewCount: reviews.length,
      reviews: reviews.slice(0, 5).map(r => ({
        text: (r.review_text || "").slice(0, 300),
        workload: (r.workload_text || "").slice(0, 200),
        date: r.created
      })),
      culpaUrl: `${CULPA_SITE}/professor/${m.id}`,
      source: "api"
    };
  } catch (e) {
    console.log("[CULPA] API unreachable:", e.message);
    return null;
  }
}

/* ── Strategy 2 — Probe culpa.info internal endpoints ──── */

async function tryProbe(first, last) {
  // Modern CULPA (Spectator version) may expose /api/* routes.
  // We try a few common patterns used by React+Next.js apps.
  const q = encodeURIComponent(last);
  const urls = [
    `${CULPA_SITE}/api/search?q=${q}`,
    `${CULPA_SITE}/api/professors?search=${q}`,
    `${CULPA_SITE}/api/professors/search/${q}`,
    `${CULPA_SITE}/api/v1/search?query=${q}`,
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(4000),
        headers: { Accept: "application/json" }
      });
      if (!r.ok) continue;
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { continue; }

      const arr =
        json.professors || json.results || json.data?.professors ||
        json.data?.results || (Array.isArray(json) ? json : null);
      if (!arr?.length) continue;

      const match = arr.find(p => {
        const fn = (p.first_name || p.firstName || "").toLowerCase();
        const ln = (p.last_name || p.lastName || p.name || "").toLowerCase();
        return fn.includes(first.toLowerCase()) && ln.includes(last.toLowerCase());
      });
      if (!match) continue;

      const id = match.id || match._id || 0;
      return {
        id,
        firstName: match.first_name || match.firstName || first,
        lastName: match.last_name || match.lastName || last,
        nugget: match.nugget || match.badge || "None",
        reviewCount: match.review_count || match.reviewCount || match.reviews?.length || 0,
        reviews: [],
        culpaUrl: `${CULPA_SITE}/professor/${id}`,
        source: "site-api"
      };
    } catch (_) {}
  }
  return null;
}

/* ── Strategy 3 — Link-only fallback ────────────────────── */

function linkFallback(first, last) {
  return {
    id: 0,
    firstName: first,
    lastName: last,
    nugget: "None",
    reviewCount: -1, // signals "unknown — click to check"
    reviews: [],
    culpaUrl: `${CULPA_SITE}`,
    source: "link-only"
  };
}

/* ── Main lookup ────────────────────────────────────────── */

async function lookupProfessor(name) {
  const key = `culpa:${name.toLowerCase().trim()}`;
  const cached = await cacheGet(key);
  if (cached) return cached;

  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const first = parts[0];
  const last  = parts[parts.length - 1];

  let result =
    (await tryAPI(first, last)) ||
    (await tryProbe(first, last)) ||
    linkFallback(first, last);

  await cacheSet(key, result);
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
