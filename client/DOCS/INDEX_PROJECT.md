# Index Page Marketplace Preview — Project Document


### FILE ROOTS

C:\Users\Scott\Desktop\WKG\INVOICER\client\
C:\Users\Scott\Desktop\WKG\INVOICER\server\
C:\Users\Scott\Desktop\WKG\LEEDZ\FRONT_3\
C:\Users\Scott\Desktop\WKG\LEEDZ\FRONT_3\py\

DO NOT GLOB THE ENTIRE HARD DRIVE!  BE TARGETED WHEN SEARCHING FOR FILES.

## What This Is


The landing page at `theleedz.com` (served from `index.html`) has a **marketplace preview** section that shows the 5 most recently posted leedz. This document covers the frontend display logic and the backend changes that power it — and how this same pattern will eventually drive auto-generated SSR landing pages for SEO.

---

## Architecture Overview

```
index.html
  └── js/index.js (ES6 module, loaded at bottom of page)
        ├── db_getTrades()  →  API Gateway  →  getTrades Lambda  →  DynamoDB (Trades table)
        └── db_getLeedz()   →  API Gateway  →  getLeedz Lambda   →  DynamoDB (Leedz_DB)
```

- **No frameworks.** Vanilla HTML/CSS/JS.
- **API Gateway:** `https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1/`
- **DynamoDB table:** `Leedz_DB`
  - Partition key: `pk` (e.g., `leed#dj`, `leed#caricatures`)
  - Sort key: `sk` (leed ID)
  - Key fields: `st` (start time, epoch ms), `dp` (date posted, epoch ms), `cr` (creator email), `ti` (title), `zp` (zip), `pr` (price in cents), `db` (date bought, 0 = unsold), `bn` (buyer name)

---

## The Display Algorithm (index.js)

### Step 1: Get Active Trades
```js
const allTrades = await db_getTrades();
const activeTrades = allTrades.filter(t => t.nl > 0);
```
`getTrades` returns all trades sorted by `nl` (number of leedz) descending. We filter to only trades that have at least one leed.

### Step 2: Pick Top 5 Trades by Popularity
```js
const topTrades = activeTrades.slice(0, 5);
const tradeNames = topTrades.map(t => t.sk);
```
Only query the 5 most popular trades (by leed count). This reduces API load — previously it queried all 36 active trades.

### Step 3: Fetch Leedz for Those Trades
```js
const allLeedz = await db_getLeedz(tradeNames, 0, 9999999999999, null, null);
```
Calls the `getLeedz` Lambda with:
- `sb` = comma-delimited trade names
- `st` = 0 (but see **Python Falsy-Zero Note** below)
- `et` = 9999999999999 (far future)

### Step 4: Round-Robin — One Leed Per Trade, Most Recently Posted
```js
const byTrade = {};
allLeedz.forEach(leed => {
    const trade = leed.pk;
    if (!byTrade[trade] || parseInt(leed.dp || 0) > parseInt(byTrade[trade].dp || 0)) {
        byTrade[trade] = leed;
    }
});

const topLeedz = Object.values(byTrade)
    .sort((a, b) => parseInt(b.dp || 0) - parseInt(a.dp || 0))
    .slice(0, 5);
```
Groups results by `pk` (trade). From each trade, picks the leed with the highest `dp` (most recently posted). Then sorts the 5 picks by `dp` descending. This guarantees **trade variety** — no more 5 rows from the same trade.

### Step 5: Render
```js
populateTable(topLeedz);
```
Builds `<tr>` rows into `#marketplace_tbody` with columns: Creator, Date (from `st`), Zip, Title, Price (from `pr`, stored in cents, displayed as dollars).

---

## Key Files

| File | Location | Role |
|------|----------|------|
| `index.html` | `FRONT_3/index.html` | Landing page HTML — marketplace preview table at lines 116-152 |
| `index.js` | `FRONT_3/js/index.js` | Marketplace preview logic — fetches data, selects leedz, renders table |
| `dbTools.js` | `FRONT_3/js/dbTools.js` | API client — `db_getTrades()` (line 471), `db_getLeedz()` (line 756) |
| `getLeedz.py` | `FRONT_3/py/getLeedz.py` | Lambda backend — `searchForLeedz_byTrades()` (line 219) |
| `error.js` | `FRONT_3/js/error.js` | Error handling utilities |
| `globals.css` | `FRONT_3/css/globals.css` | CSS variables and global layout |
| `dashboard.css` | `FRONT_3/css/dashboard.css` | `.search_results_table` styles (lines 271-296) |
| `index.css` | `FRONT_3/css/index.css` | Landing page specific styles |

---

## Backend Change: `dp` Added to Projection

The `getLeedz` Lambda has two query modes:
- **Mode 1 — Marketplace Discovery:** Query by trade subscriptions (`sb` param)
- **Mode 2 — Creator Dashboard:** Query by creator email (`cr` param)

Mode 2 (creator dashboard) already returned `dp` via `GSI_cr`.

**Mode 1 was missing `dp` in its ProjectionExpression.** This was added:

```python
# getLeedz.py line 258 — BEFORE:
ProjectionExpression='pk,sk,st,et,zp,ti,cr,pr,xy,db,bn'

# AFTER (dp added):
ProjectionExpression='pk,sk,st,et,zp,ti,cr,pr,xy,db,bn,dp'
```

Without `dp`, the frontend couldn't sort by date posted — it was sorting by `st` (start time), which pushed far-future events to the top regardless of when they were posted.

**This Lambda must be deployed for the change to take effect.** The local file is at `FRONT_3/py/getLeedz.py`. Deploy with:
```
aws lambda update-function-code --function-name getLeedz --zip-file fileb://getLeedz.zip
```
(Zip the .py file first, or use whatever deployment method is in place.)

---

## Python Falsy-Zero Note

`getLeedz.py` line 228:
```python
start_time = int(st) if st else int(time.time() * 1000)
```

When the frontend passes `st=0`, Python's `validateParam()` converts string `'0'` to integer `0`. Then `if st` evaluates `if 0` → **False** → defaults to NOW.

**This is actually correct behavior for the marketplace preview** — it means only future events are shown (you don't want to display leads for parties that already happened). But it means passing `st=0` is functionally identical to not passing `st` at all.

If you ever need to query from epoch zero (all leedz including past), pass `st=1` instead of `st=0`.

---

## HTML Structure (index.html lines 116-152)

```html
<div class="info_box_container marketplace_box">
    <div class="marketplace_header">
        <span class="marketplace_title">New on the Leedz</span>
        <span class="marketplace_date" id="marketplace_date"></span>
    </div>
    <table class="search_results_table" style="padding:33px;">
        <thead>
            <tr>
                <th>Creator</th>
                <th>Date</th>
                <th>Zip</th>
                <th>Title</th>
                <th>Price</th>
            </tr>
        </thead>
        <tbody id="marketplace_tbody">
            <tr>
                <td colspan="5" class="loading_cell">Loading...</td>
            </tr>
        </tbody>
    </table>
    <div id="marketplace_error" style="display:none;">
        No active leedz at this time.
    </div>
</div>
```

**Note:** The table uses `class="search_results_table"` but has **no `id` attribute**. The error handler in `index.js` references `document.getElementById('marketplace_preview_table')` which doesn't exist — this is a latent bug that would throw if the error path is hit. Should be fixed to target the table by class or add an `id`.

---

## Price Display

Prices are stored in DynamoDB as **cents** (integer). The `formatPrice()` function in `index.js` divides by 100:
- `pr=0` → "Free"
- `pr=135` → "$1.35"
- `pr=500` → "$5"
- `pr=10000` → "$100"

---

## Connection to SEO Landing Pages

There is a companion document at `FRONT_3/DOCS/SEO_PLAN.md` that describes 5 trade-specific static HTML landing pages (dj-leads.html, caricature-leads.html, etc.) targeting long-tail SEO keywords. Those pages currently use **hardcoded mock data** in their leedz tables.

### The Vision: Automated SSR Pages by Trade

The same `getLeedz` API — specifically the marketplace discovery mode (`sb` param) — can power **server-side rendered** versions of these pages. The pattern:

1. A scheduled job (Lambda, cron, CI pipeline) runs periodically (daily or weekly)
2. For each target trade, call `getLeedz?sb={trade}&et=9999999999999`
3. Pick the top 5 most recently posted (`dp` descending) leedz from the response
4. Render a static HTML page with those leedz baked in — same template structure as the SEO pages
5. Upload the generated HTML to S3/hosting — replacing the previous version
6. Google re-crawls, sees fresh content, improves ranking

This is why the `dp` field matters in the projection — it enables sorting by recency, which is the display logic both the index page preview AND the future SSR pages need.

The round-robin algorithm from `index.js` (one leed per trade) wouldn't apply to trade-specific SEO pages since those are single-trade. But for the general `vendor-leads.html` and `wedding-vendor-leads.html` pages, the same grouping logic could be reused to show variety across trades.

### What's Needed for SSR Automation

| Component | Status | Notes |
|-----------|--------|-------|
| `getLeedz` API returns `dp` | ✅ Done (needs deploy) | ProjectionExpression updated |
| Frontend sorts by `dp` | ✅ Done | index.js updated |
| Round-robin by trade | ✅ Done | index.js groups by `pk` |
| SEO page templates | 📋 Planned | See `FRONT_3/DOCS/SEO_PLAN.md` |
| Static HTML generator script | ❌ Not started | Could be Node.js or Python — calls API, renders HTML, writes files |
| Scheduled execution | ❌ Not started | CloudWatch Events → Lambda, or GitHub Actions cron |
| Auto-deploy to hosting | ❌ Not started | S3 sync or equivalent |

### API Endpoint Reference

```
# Marketplace discovery — returns leedz for given trades with future start times
GET /getLeedz?sb={trade1,trade2,...}&st=0&et=9999999999999

# All trades sorted by leed count
GET /getTrades

# Base URL
https://jjz8op6uy4.execute-api.us-west-2.amazonaws.com/Leedz_Stage_1/
```

No authentication required for these endpoints.

---

## Deployment Checklist

- [ ] Deploy updated `getLeedz.py` Lambda (adds `dp` to projection)
- [ ] Deploy updated `index.js` to theleedz.com hosting
- [ ] Verify marketplace preview shows 5 leedz, one per trade, sorted by recency
- [ ] Verify the `marketplace_preview_table` ID bug doesn't cause visible errors (it only triggers on the error path)
- [ ] Build SEO landing pages per `FRONT_3/DOCS/SEO_PLAN.md`
- [ ] Eventually: build SSR generator that calls the same API to auto-refresh SEO page content
