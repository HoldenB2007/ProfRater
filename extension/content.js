// content.js — Injected into Vergil. Finds instructor names and injects CULPA badges.

(function () {
  "use strict";

  const ATTR = "data-culpa";
  const DEBOUNCE_MS = 600;

  /* ── Nugget config ───────────────────────────────────── */

  const NUGGETS = {
    Gold:   { emoji: "🥇", label: "Gold Nugget",   cls: "culpa-gold" },
    Silver: { emoji: "🥈", label: "Silver Nugget", cls: "culpa-silver" },
    Bronze: { emoji: "🥉", label: "Bronze Nugget", cls: "culpa-bronze" },
    None:   { emoji: "",   label: "",              cls: "" }
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

  /* ── Shared tooltip (appended to body to escape parent opacity) ── */

  const tooltip = document.createElement("div");
  tooltip.className = "culpa-tooltip";
  document.body.appendChild(tooltip);

  function showTooltip(badge, html) {
    tooltip.innerHTML = html;
    tooltip.style.visibility = "hidden";
    tooltip.style.display = "block";
    // Measure after layout
    const rect = badge.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tooltip.offsetWidth - 8));
    const top = rect.top - tooltip.offsetHeight - 10;
    tooltip.style.left = left + "px";
    tooltip.style.top  = top + "px";
    tooltip.style.visibility = "visible";
  }

  function hideTooltip() {
    tooltip.style.display = "none";
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

    let html = "";
    if (data.avgRating != null) html += `<span class="culpa-rating">${data.avgRating.toFixed(1)}</span>`;
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

    if (data.reviewCount > 0) {
      let tipHTML = `
        <div class="culpa-tip-header">
          <strong>${data.firstName} ${data.lastName}</strong>
          ${nug.emoji ? `<span class="culpa-tip-nugget">${nug.emoji} ${nug.label}</span>` : ""}
        </div>
        ${data.avgRating != null ? `<div class="culpa-tip-rating"><span class="culpa-tip-rating-num">${data.avgRating.toFixed(1)}</span><span class="culpa-tip-rating-max"> / 5</span></div>` : ""}
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


      badge.addEventListener("mouseenter", () => showTooltip(badge, tipHTML));
      badge.addEventListener("mouseleave", hideTooltip);
    }

    return badge;
  }

  /* ── Name parsing ────────────────────────────────────── */

  const NAME_CONNECTORS = new Set([
    "de","di","von","van","el","al","la","le","du","da","dos","del","bin","ibn"
  ]);

  // Vergil format: "Last, First  (uni)" → "First Last"
  function parseVergilName(raw) {
    // Strip UNI in parentheses e.g. " (lp2149)"
    let t = raw.trim().replace(/\s*\([^)]+\)\s*$/, "").trim();

    // Convert "Last, First" → "First Last"
    if (/^[^\s,]+,\s*\S/.test(t)) {
      const commaIdx = t.indexOf(",");
      const last  = t.slice(0, commaIdx).trim();
      const first = t.slice(commaIdx + 1).trim();
      t = `${first} ${last}`;
    }

    return t;
  }

  function isValidName(text) {
    if (!text || text.length < 4 || text.length > 80) return false;
    const words = text.split(/\s+/);
    if (words.length < 2 || words.length > 6) return false;
    return words.every(w =>
      /^[A-Z]/.test(w) ||
      NAME_CONNECTORS.has(w.toLowerCase()) ||
      /^[A-Z]\.?$/.test(w)
    );
  }

  /* ── Vergil DOM scanning ─────────────────────────────── */

  // Target: span.instructor (course section rows)
  // Name is inside the child div.text as "Last, First  (uni)"
  function findInstructorElements() {
    const found = [];
    document.querySelectorAll("span.instructor").forEach(el => {
      if (!el.getAttribute(ATTR)) found.push(el);
    });
    return found;
  }

  /* ── Process a single element ─────────────────────────── */

  async function processElement(el) {
    if (el.getAttribute(ATTR)) return;
    el.setAttribute(ATTR, "pending");

    const textEl = el.querySelector("div.text");
    if (!textEl) { el.setAttribute(ATTR, "skip"); return; }

    const name = parseVergilName(textEl.textContent || "");

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
    // Insert after span.instructor, not inside the nested <a>
    el.insertAdjacentElement("afterend", badge);
  }

  /* ── Main scan loop ──────────────────────────────────── */

  async function scan() {
    const elements = findInstructorElements();
    await Promise.allSettled(elements.map(el => processElement(el)));
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
