# CULPA on Vergil — Claude Context

## What this is
A Chrome extension (Manifest V3) that overlays CULPA professor ratings on Columbia's Vergil course registration SPA. Injects badges next to instructor names with review counts, nugget status, and a hover tooltip.

## Key files
- `manifest.json` — MV3 config, permissions, host rules
- `background.js` — service worker: cascading CULPA API lookup (api.culpa.info → culpa.info internal probe → link fallback), 24h cache via chrome.storage.local
- `content.js` — injected into Vergil: MutationObserver + 4 DOM scanning strategies to find instructor names, sends lookups to background, injects badges
- `content.css` — dark-themed badge + tooltip styles
- `popup.html` — extension popup: active status, nugget legend, cache clear button

## Architecture notes
- Vergil is a React SPA — all DOM scanning must handle dynamic content via MutationObserver
- Lookups are async, debounced (600ms), and cached to avoid hammering the API
- `data-culpa` attribute is stamped on processed elements to prevent double-processing
- `api.culpa.info` uses HTTP (not HTTPS) — may hit mixed-content issues depending on browser policy
- Badge HTML is built via innerHTML — name/review data should be treated as untrusted if sources change

## Repo
https://github.com/HoldenB2007/ProfRater.git
