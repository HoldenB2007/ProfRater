# CULPA on Vergil — Chrome Extension

See CULPA professor ratings directly on Columbia's Vergil course registration page.

## What it does

When you browse courses on **Vergil** (`vergil.columbia.edu`), this extension automatically:

1. **Detects instructor names** in course listings using multiple DOM scanning strategies
2. **Looks them up on CULPA** via a cascading lookup strategy:
   - First tries the classic REST API at `api.culpa.info`
   - Then probes common internal API patterns on `culpa.info`
   - Falls back to a direct CULPA link so you can check manually
3. **Injects a compact badge** next to each instructor showing:
   - 🥇 Gold or 🥈 Silver nugget status (if applicable)
   - Number of CULPA reviews
   - Hover tooltip with the latest review preview and workload info
   - Click to open the professor's full CULPA page

## Installation

1. Download and unzip this folder
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** → select the unzipped `culpa-vergil-extension` folder
5. Navigate to Vergil — badges should appear next to instructor names

## File structure

```
culpa-vergil-extension/
├── manifest.json      # Extension config (Manifest V3)
├── background.js      # Service worker — cascading CULPA API lookups + caching
├── content.js         # Injected into Vergil — finds instructors, injects badges
├── content.css        # Badge & tooltip styles
├── popup.html         # Extension popup with status, legend, and cache controls
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Architecture

### Content script (`content.js`)
Runs on Vergil pages. Uses a **MutationObserver** to watch for dynamically loaded content (Vergil is a React SPA). Four scanning strategies:

| Strategy | How it works |
|----------|-------------|
| **Class-based** | Finds elements with class names containing "instructor", "professor", "faculty" |
| **Label-sibling** | Finds "Instructor:" labels and grabs the adjacent value element |
| **Inline text** | Walks text nodes looking for `Instructor: First Last` patterns |
| **Link-based** | Finds anchor tags with instructor/faculty URLs |

Names are validated (must look like 2-5 words, capitalized, not a blacklisted phrase) before being sent for lookup.

### Background worker (`background.js`)
Receives lookup requests from the content script and tries three strategies in order:

1. **`api.culpa.info`** — the classic REST API (may or may not still be online)
2. **`culpa.info` internal API probing** — tries common `/api/*` patterns
3. **Link-only fallback** — returns a badge that links to CULPA for manual lookup

Results are cached in `chrome.storage.local` for 24 hours. You can clear the cache from the extension popup.

## Customizing

- **Badge appearance**: edit `content.css`
- **Review preview length**: in `background.js`, find `.slice(0, 300)` for review text
- **Cache duration**: in `background.js`, change `CACHE_TTL`
- **Scan delay/debounce**: in `content.js`, adjust `DEBOUNCE_MS`

## Adapting to Vergil DOM changes

Since Vergil is a React SPA, its DOM structure may change. If badges stop appearing:

1. Open Vergil in Chrome
2. Right-click an instructor name → Inspect
3. Note the element tag, class names, and parent structure
4. Update the selectors in `findInstructorElements()` in `content.js`

## Privacy

- Only communicates with `api.culpa.info` and `culpa.info`
- Results cached locally in your browser via `chrome.storage.local`
- No analytics, tracking, or data collection
- Only runs on `vergil.columbia.edu` pages

## Disclaimer

This extension is not affiliated with Columbia University, CULPA, or the Columbia Spectator. It is a student-built tool for convenience during course registration.
