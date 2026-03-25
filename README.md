# CULPA on Vergil

Shows CULPA professor ratings directly on Columbia's Vergil course registration page. Available as a Chrome extension and a Safari extension.

## What it does

When you browse courses on **Vergil** (`vergil.columbia.edu`), the extension automatically:

1. Detects instructor names in course section rows and the instructor autocomplete dropdown
2. Looks them up on the live **culpa.info API**
3. Injects a compact badge next to each instructor showing:
   - Average rating (e.g. `3.1`)
   - Nugget status: 🥉 Bronze (3.0+) / 🥈 Silver (3.5+) / 🥇 Gold (4.0+)
   - Review count
   - Hover tooltip with rating, nugget, review count, and "Click box to view on CULPA"
   - Click to open the professor's full CULPA page

## Repo

https://github.com/HoldenB2007/ProfRater.git

## Installation — Chrome

1. Clone or download this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `chrome/` folder
5. Navigate to Vergil — badges appear automatically

## Installation — Safari

Safari Web Extensions must be wrapped in a native app using Xcode.

1. Clone this repo
2. Run the converter (requires Xcode command-line tools):
   ```
   xcrun safari-web-extension-converter safari/ \
     --app-name "CULPA on Vergil" \
     --bundle-identifier com.holdenb.culpavergil \
     --macos-only
   ```
3. Open the generated Xcode project → **Product → Run** (⌘R)
4. In Safari: **Develop → Allow Unsigned Extensions** (one-time)
5. Open **Safari → Settings → Extensions** → enable **CULPA on Vergil**
6. Navigate to Vergil — badges appear automatically

> If the Develop menu isn't visible: **Safari → Settings → Advanced → Show features for web developers**

## File structure

```
culpa-vergil-extension/
├── chrome/                 ← Load this folder as the Chrome extension
│   ├── manifest.json       MV3 config, permissions, host rules
│   ├── background.js       Service worker: CULPA API lookups + 24h cache
│   ├── content.js          Injected into Vergil: finds instructors, injects badges
│   ├── content.css         Badge + tooltip styles
│   ├── popup.html          Extension popup: status, legend, cache clear
│   ├── popup.js            Popup script (status check + cache clear handler)
│   └── icons/              16/48/128/256px icons (transparent bg, from logo.png)
├── safari/                 ← Web extension source for Safari (same structure as chrome/)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── content.css
│   ├── popup.html
│   ├── popup.js
│   └── icons/
├── logo.png                Project logo (source for icons)
└── .gitignore
```

## Architecture

### Content script (`content.js`)

Runs on Vergil pages. Uses a **MutationObserver** to handle Vergil's Angular SPA navigation.

Two scanners run on every DOM change (debounced 600ms):

| Scanner | Selector | Name format |
|---------|----------|-------------|
| Course section rows | `span.instructor > div.text` | `Last, First (uni)` |
| Instructor autocomplete dropdown | `mat-option` containing a UNI pattern `(abc123)` | `First Last (uni)` |

`parseVergilName()` handles both formats: strips the UNI, flips comma-separated names.

A single shared tooltip div is appended to `document.body` (not inside the badge) to avoid inheriting opacity from Vergil's table row transitions.

### Background service worker (`background.js`)

Receives `CULPA_LOOKUP` messages from the content script.

**Lookup flow (2 API calls in sequence):**

1. `GET /api/professor/search?queryString={First Last}&maxResults=20`
   - Returns array of `{ professor_header: { professor_id, first_name, last_name, nugget } }`
   - Nugget values: `0=None`, `1=Bronze`, `2=Silver`, `3=Gold`
   - Matches by exact name → last name only → first result
2. `GET /api/professor_page/card/{professor_id}`
   - Returns `professor_summary.avg_rating` and `professor_summary.num_reviews`

Results cached in `chrome.storage.local` for 24 hours. Clear from the extension popup.

### culpa.info API (discovered from SPA JS bundle)

Base: `https://culpa.info`

| Endpoint | Description |
|----------|-------------|
| `GET /api/professor/search?queryString={name}&maxResults=20` | Search professors by name |
| `GET /api/professor_page/card/{id}` | Professor details: avg_rating, num_reviews, ai_overview |
| `GET /api/review/professor/{id}?page=1` | Paginated reviews, returns number_of_reviews |
| `GET /api/front_page` | Homepage data |
| `GET /api/departments/all` | All departments |

The API was discovered by downloading `culpa.info/static/js/main.*.js` and grepping for `api/` strings. The search parameter name is `queryString` (not `q` or `query`).

**CORS note:** `culpa.info/api/*` has `Access-Control-Allow-Origin: http://localhost:3000`. Chrome and Safari extension service workers with `host_permissions` for `https://culpa.info/*` bypass this restriction. Do NOT add `Content-Type: application/json` to GET requests — it triggers a preflight that fails.

## Vergil DOM notes

Vergil is an **Angular Material SPA** at `vergil.columbia.edu`.

- Course section rows: `<span class="instructor"><a><div class="text">Last, First (uni)</div></a></span>`
- Badges are inserted with `span.instructor.insertAdjacentElement("afterend", badge)` — not inside the `<a>` tag (invalid HTML)
- Instructor autocomplete: `<mat-option>First Last (uni)</mat-option>` — badges appended inside the option
- Vergil applies opacity transitions to table rows; the tooltip must live on `document.body` to avoid inheriting opacity

## Adapting to Vergil DOM changes

If badges stop appearing:
1. Open Vergil → right-click an instructor name → Inspect
2. Find the element containing `Last, First (uni)` text
3. Update `findInstructorElements()` selector in `content.js`
4. Check `processElement()` if the child text element path changed

## Customization

| What | Where |
|------|-------|
| Badge appearance | `content.css` — `.culpa-badge`, `.culpa-gold/silver/bronze` |
| Tooltip size/style | `content.css` — `.culpa-tooltip` and `.culpa-tip-*` |
| Cache duration | `background.js` — `CACHE_TTL` (default 24h) |
| Scan debounce | `content.js` — `DEBOUNCE_MS` (default 600ms) |
| Popup content | `popup.html` + `popup.js` |


## Privacy

- Only communicates with `culpa.info`
- Results cached locally via `chrome.storage.local`
- No analytics or tracking
- Only runs on `vergil.columbia.edu` pages

Full privacy policy: https://holdenb2007.github.io/ProfRater/privacy.html

## Disclaimer

Not affiliated with Columbia University, CULPA, or the Columbia Spectator.
