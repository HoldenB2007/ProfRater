// content.js — Injected into Vergil. Finds instructor names and injects CULPA badges.

(function () {
  "use strict";

  const ATTR = "data-culpa";
  const DEBOUNCE_MS = 600;

  /* ── Nugget config ───────────────────────────────────── */

  const NUGGETS = {
    Gold:   { emoji: "🥇", label: "Gold Nugget",   cls: "culpa-gold" },
    Silver: { emoji: "🥈", label: "Silver Nugget",  cls: "culpa-silver" },
    None:   { emoji: "",   label: "",               cls: "" }
  };

  /* ── Messaging ───────────────────────────────────────── */

  function lookup(name) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "CULPA_LOOKUP", name }, r => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(r?.result || null);
      });
    });
  }

  /* ── Badge creation ──────────────────────────────────── */

  function makeBadge(data) {
    const badge = document.createElement("a");
    badge.className = "culpa-badge";
    badge.href = data.culpaUrl;
    badge.target = "_blank";
    badge.rel = "noopener";
    badge.addEventListener("click", e => e.stopPropagation());

    const nug = NUGGETS[data.nugget] || NUGGETS.None;
    if (nug.cls) badge.classList.add(nug.cls);

    // Content
    let html = "";
    if (nug.emoji) html += `<span class="culpa-nugget">${nug.emoji}</span>`;
    html += `<span class="culpa-label">CULPA</span>`;

    if (data.reviewCount > 0) {
      html += `<span class="culpa-count">${data.reviewCount} review${data.reviewCount !== 1 ? "s" : ""}</span>`;
    } else if (data.reviewCount === -1) {
      html += `<span class="culpa-count">view reviews</span>`;
    } else {
      html += `<span class="culpa-count">0 reviews</span>`;
    }

    badge.innerHTML = html;

    // Tooltip (only if we have review data)
    if (data.reviews?.length > 0 || data.reviewCount > 0) {
      const tip = document.createElement("div");
      tip.className = "culpa-tooltip";

      let tipHTML = `
        <div class="culpa-tip-header">
          <strong>${data.firstName} ${data.lastName}</strong>
          ${nug.emoji ? `<span class="culpa-tip-nugget">${nug.emoji} ${nug.label}</span>` : ""}
        </div>
        <div class="culpa-tip-stats">${data.reviewCount} review${data.reviewCount !== 1 ? "s" : ""} on CULPA</div>
      `;

      if (data.reviews?.length > 0) {
        const rev = data.reviews[0];
        tipHTML += `
          <div class="culpa-tip-review">
            <div class="culpa-tip-review-label">Latest review</div>
            <div class="culpa-tip-review-text">"${rev.text}${rev.text.length >= 300 ? "…" : ""}"</div>
            ${rev.workload ? `<div class="culpa-tip-workload"><strong>Workload:</strong> ${rev.workload}${rev.workload.length >= 200 ? "…" : ""}</div>` : ""}
            ${rev.date ? `<div class="culpa-tip-date">${new Date(rev.date).toLocaleDateString()}</div>` : ""}
          </div>
        `;
      }

      tipHTML += `<div class="culpa-tip-cta">Click to view on CULPA →</div>`;
      tip.innerHTML = tipHTML;
      badge.appendChild(tip);
    }

    return badge;
  }

  /* ── Name validation ─────────────────────────────────── */

  const NAME_CONNECTORS = new Set([
    "de","di","von","van","el","al","la","le","du","da","dos","del","bin","ibn"
  ]);
  const BLACKLIST = new Set([
    "teaching assistant","office hours","course description","not available",
    "to be announced","staff","tba","multiple instructors","instructor tba",
    "see department","open to"
  ]);

  function isValidName(text) {
    if (!text || text.length < 4 || text.length > 80) return false;
    const lower = text.toLowerCase();
    for (const b of BLACKLIST) { if (lower.includes(b)) return false; }

    const words = text.split(/\s+/);
    if (words.length < 2 || words.length > 5) return false;

    return words.every(w =>
      /^[A-Z]/.test(w) ||
      NAME_CONNECTORS.has(w.toLowerCase()) ||
      /^[A-Z]\.?$/.test(w) // initials like "J." or "J"
    );
  }

  function cleanName(raw) {
    let t = raw.trim();
    t = t.replace(/^(instructor|professor|prof\.?|dr\.?)[:\s]*/i, "");
    t = t.replace(/\s*\(.*?\)/g, "");
    t = t.replace(/,.*$/, ""); // "Last, First" → just "Last"… handled below
    t = t.trim();
    return t;
  }

  /* ── Vergil DOM scanning ─────────────────────────────── */

  // Vergil is a React SPA. Course listings show sections with instructor info.
  // We use multiple strategies to find instructor names robustly.

  function findInstructorElements() {
    const found = [];

    // ── Strategy A: Elements whose class/attribute hints at "instructor" ──
    document.querySelectorAll([
      '[class*="instructor" i]',
      '[class*="Instructor" i]',
      '[class*="professor" i]',
      '[class*="faculty" i]',
      '[class*="teacher" i]',
      '[data-testid*="instructor" i]',
      '[aria-label*="instructor" i]',
    ].join(",")).forEach(el => {
      if (!el.getAttribute(ATTR)) found.push({ el, strategy: "class" });
    });

    // ── Strategy B: Table cells / list items after an "Instructor" label ──
    document.querySelectorAll("th, td, dt, label, span, div").forEach(el => {
      const t = el.textContent?.trim();
      if (!t) return;
      if (!/^instructor/i.test(t)) return;

      // Grab the next sibling or the value cell
      const targets = [
        el.nextElementSibling,
        el.parentElement?.querySelector("td:last-child, dd, span:last-child"),
      ];
      targets.forEach(target => {
        if (target && !target.getAttribute(ATTR)) {
          found.push({ el: target, strategy: "label-sibling" });
        }
      });
    });

    // ── Strategy C: Text nodes containing "Instructor: Name" inline ──
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode;
      const match = node.textContent?.match(
        /(?:instructor|professor)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i
      );
      if (match) {
        const parent = node.parentElement;
        if (parent && !parent.getAttribute(ATTR)) {
          found.push({ el: parent, extractedName: match[1], strategy: "inline" });
        }
      }
    }

    // ── Strategy D: Links to instructor pages / directory pages ──
    document.querySelectorAll('a[href*="instructor"], a[href*="faculty"]').forEach(el => {
      if (!el.getAttribute(ATTR)) {
        found.push({ el, strategy: "link" });
      }
    });

    return found;
  }

  /* ── Process a single candidate ──────────────────────── */

  async function processCandidate(candidate) {
    const el = candidate.el;
    if (el.getAttribute(ATTR)) return;
    el.setAttribute(ATTR, "pending");

    // Extract name
    let name = candidate.extractedName || cleanName(el.textContent || "");

    // Handle "Last, First" format
    if (/^[A-Z][a-z]+,\s*[A-Z]/.test(name)) {
      const [last, first] = name.split(/,\s*/);
      name = `${first} ${last}`;
    }

    if (!isValidName(name)) {
      el.setAttribute(ATTR, "skip");
      return;
    }

    const data = await lookup(name);
    if (!data) {
      el.setAttribute(ATTR, "miss");
      return;
    }

    el.setAttribute(ATTR, "done");
    const badge = makeBadge(data);

    // Insert badge after the text, keeping layout intact
    if (el.tagName === "A" || el.tagName === "SPAN") {
      el.insertAdjacentElement("afterend", badge);
    } else {
      el.appendChild(badge);
    }
  }

  /* ── Main scan loop ──────────────────────────────────── */

  async function scan() {
    const candidates = findInstructorElements();
    await Promise.allSettled(candidates.map(c => processCandidate(c)));
  }

  // Initial scan with a small delay to let Vergil render
  setTimeout(scan, 1000);

  // Watch for SPA navigation & dynamic content
  let timer;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  console.log("[CULPA on Vergil] Content script active. Watching for instructors…");
})();
