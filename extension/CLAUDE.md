# CULPA on Vergil — Claude/AI Context

## Project summary

Chrome extension (Manifest V3) that overlays CULPA professor ratings on Columbia's Vergil course registration SPA. Injects badges showing avg rating, nugget status, and review count next to instructor names — both in course section rows and the instructor autocomplete dropdown.

**Repo:** https://github.com/HoldenB2007/ProfRater.git
**Owner:** HoldenB2007 (collaborator: hbb2119)

## Commit rules

- Never include "Co-Authored-By: Claude" or any AI attribution in commit messages
- Make logical, focused commits with clear messages

## File map

```
extension/
├── manifest.json   MV3: permissions, host_permissions, content_scripts, background
├── background.js   Service worker: culpa.info API lookup + chrome.storage.local cache
├── content.js      Injected into Vergil: MutationObserver, DOM scanning, badge injection
├── content.css     Badge + tooltip styles (position: fixed tooltip on document.body)
├── popup.html      Extension popup UI
├── popup.js        Popup logic: status check + cache clear
└── icons/          16/48/128/256px icons (transparent background PNG)
```

## culpa.info API (the only working API — discovered from SPA JS bundle)

Base URL: `https://culpa.info`

**Search:** `GET /api/professor/search?queryString={First Last}&maxResults=20`
Returns: `[{ professor_header: { professor_id, first_name, last_name, nugget }, ... }]`
Nugget values: `0=None 1=Bronze 2=Silver 3=Gold`

**Professor card:** `GET /api/professor_page/card/{id}`
Returns: `{ professor_summary: { avg_rating, num_reviews, professor_header, ai_overview }, courses_taught }`

**Reviews:** `GET /api/review/professor/{id}?page=1&sort_key=null&course_filter=null`
Returns: `{ number_of_reviews, reviews: [{ content, rating, workload, submission_date, ... }] }`

**IMPORTANT CORS:** The API sets `Access-Control-Allow-Origin: http://localhost:3000`. Extension service workers bypass this via `host_permissions`. Do NOT add `Content-Type: application/json` to GET requests — it triggers a CORS preflight that fails.

`api.culpa.info` is completely dead (ECONNREFUSED). Never use it.

## background.js lookup flow

1. `searchProfessor(first, last)` → `/api/professor/search` → find best match
2. `getProfessorCard(id)` → `/api/professor_page/card/{id}` → get avg_rating + num_reviews
3. Returns: `{ id, firstName, lastName, nugget (string), nuggetNum, avgRating, reviewCount, culpaUrl, source }`
4. Cache key: `culpa:{lowercase name}`, TTL: 24h via `chrome.storage.local`

## content.js DOM scanning

**Vergil is an Angular Material SPA.** Two scanners, both debounced at 600ms via MutationObserver:

### Course section rows
- Selector: `span.instructor` (not inside — has child `div.text`)
- Name format: `Last, First (uni)` inside `div.text`
- Badge inserted: `span.instructor.insertAdjacentElement("afterend", badge)` — MUST be after the span, not inside the nested `<a>` (invalid HTML → browser ejects it)

### Instructor autocomplete dropdown
- Selector: `mat-option` elements whose text matches `/\([a-z]+\d+\)/i` (UNI pattern)
- Name format: `First Last (uni)` as direct text content
- Badge inserted: `el.appendChild(badge)` inside the mat-option

### Name parsing (`parseVergilName`)
1. Strip UNI: `.replace(/\s*\([^)]+\)\s*$/, "")`
2. If comma present (`Last, First`): flip to `First Last`
3. `isValidName`: 2-6 words, each starts with capital or is a connector (de/van/etc.)

## Tooltip architecture

The tooltip is a **single shared div appended to `document.body`**, NOT inside the badge.

**Why:** Vergil applies CSS opacity transitions to table rows. A tooltip inside a row inherits the opacity and looks translucent. By attaching to body, it escapes the stacking context entirely.

The tooltip uses `position: fixed` and is positioned using `getBoundingClientRect()` on the badge. It's made `visibility: hidden` first, then measured for height, then positioned above the badge, then made visible.

## popup.html / popup.js

- Shows active/inactive status based on current tab URL
- Legend (renamed from "Nugget Legend"): Bronze (3.0+), Silver (3.5+), Gold (4.0+)
- Logo: `icons/icon128.png` displayed at 48×48px (use 128px source for Retina sharpness)
- Cache clear button sends `CULPA_CLEAR_CACHE` message to service worker

## Known issues / gotchas

- **Cache stale after background.js changes:** If you add new fields to the lookup result, old cached entries won't have them. User must clear cache from popup.
- **mat-option re-render:** Angular may recreate mat-option elements when the dropdown list updates. The `data-culpa` attribute check prevents double-processing but new elements will be caught by the MutationObserver.
- **Name matching:** The search is fuzzy — if a professor changed their last name (e.g. Pastrick → Koval), the first result is used as fallback. This is usually correct.
- **Vergil DOM changes:** If Vergil updates its Angular components, `span.instructor` or `mat-option` selectors may need updating. Right-click → Inspect to find new selectors.

## Development workflow

1. Edit files in `extension/`
2. Go to `chrome://extensions` → click reload button on "CULPA on Vergil"
3. To debug service worker: click "Service Worker" link on the extensions page → Console tab
4. To debug content script: open Vergil → DevTools → Console (filter by extension)
5. Commit + push to GitHub (no co-author lines)

## Icons

Source: `logo.png` (1024×1024, transparent background PNG — white bg was removed with PIL).
To regenerate icons after updating logo.png:
```bash
# Remove white background first if needed
python3 -c "
from PIL import Image
img = Image.open('logo.png').convert('RGBA')
px = img.load()
for y in range(img.size[1]):
    for x in range(img.size[0]):
        r,g,b,a = px[x,y]
        if r>230 and g>230 and b>230: px[x,y]=(r,g,b,0)
img.save('logo.png')
"
# Resize
sips -z 256 256 logo.png --out extension/icons/icon256.png
sips -z 128 128 logo.png --out extension/icons/icon128.png
sips -z 48 48  logo.png --out extension/icons/icon48.png
sips -z 16 16  logo.png --out extension/icons/icon16.png
```
The popup uses `icons/icon128.png` displayed at 48×48 CSS px (sharp on Retina).
Chrome's extensions page uses `icons/icon256.png` for Retina sharpness.

## Scraper (`scraper/` directory)

Not currently used by the extension. Built as a fallback in case the culpa.info API breaks.
- `discover.js`: headless Playwright script that dumps culpa.info rendered HTML + network requests
- `index.js`: scaffold for full scraper (not implemented)
- `db.js`: Supabase client helpers
- `schema.sql`: professors + reviews tables
- Requires `scraper/.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
