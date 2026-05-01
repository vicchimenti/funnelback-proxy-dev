# Funnelback Endpoint Dictionary — 2026-05-01

**Scope:** Inventory of every Funnelback upstream endpoint that
`funnelback-proxy-dev` sends requests to. Inventory only — no
classification, no recommendations. Cited from proxy code, not from
Funnelback-side authoritative requirements.

**Search coverage:** `api/` and `lib/` searched for the literal
substring `funnelback.squiz.cloud`, for `axios.get`/`axios.post`/
`fetch(`/`http(s).request` call sites, and for env-var names like
`BACKEND_API_URL`. `lib/queryMiddleware.js` was inspected directly: it
is analytics-tracking middleware that wraps handlers and makes no
Funnelback requests of its own. `middleware.js` `fetch(...)` calls
(middleware.js:226, middleware.js:461) forward the inbound request
through Vercel's edge middleware chain to the matching `/api/*`
handler — they do not contact Funnelback. No `BACKEND_API_URL`-style
env-var indirection exists; every Funnelback URL is a literal string
constant in handler code.

**Wired-in status (vercel.json:3-21):** `/api/server.js` is wired at
`/proxy/funnelback`; `/api/search.js` at `/proxy/funnelback/search`;
`/api/tools.js` at `/proxy/funnelback/tools`; `/api/spelling.js` at
`/proxy/funnelback/spelling`; `/api/suggest.js` at
`/proxy/funnelback/suggest`; `/api/suggestPeople.js` at
`/proxy/suggestPeople`; `/api/suggestPrograms.js` at
`/proxy/suggestPrograms`. `api/suggest.js.new` has no rewrite and is
not wired in.

**Distinct upstream URLs observed:**
- `https://dxp-us-search.funnelback.squiz.cloud/s/search.html`
- `https://dxp-us-search.funnelback.squiz.cloud/s/search.json`
- `https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json`
- `https://dxp-us-search.funnelback.squiz.cloud/s/${req.query.path}`
  (dynamic path, `tools.js` only)

All requests are GET. All set `axios` `timeout` explicitly. Every
handler hard-codes the host `dxp-us-search.funnelback.squiz.cloud` —
no shared base-URL constant.

**Distinct request shapes observed:** seven (one per handler that
calls Funnelback). The same upstream URL is hit by multiple handlers
under different shapes; sub-sections below cover each distinct shape.

---

## `https://dxp-us-search.funnelback.squiz.cloud/s/search.html`

Hit by three handlers with three different shapes. The handlers do not
share request-construction code.

### Shape 1 — `search-handler` (api/search.js)

- **Method / timeout:** GET, 5000 ms (api/search.js:27, api/search.js:164-168)
- **URL declaration:** api/search.js:101-102 (`const funnelbackUrl = "https://dxp-us-search.funnelback.squiz.cloud/s/search.html";`)
- **Headers (api/search.js:139-149):**
  - `Accept: text/html` (static)
  - `X-Forwarded-For: <clientIp>` (computed from `commonUtils.extractClientIp(req)` at api/search.js:71)
  - `X-Original-Client-Ip: <clientIp>`
  - `X-Real-Ip: <clientIp>`
  - `X-Geo-City: <locationData.city || "">` (computed via `getLocationData(clientIp)` at api/search.js:108)
  - `X-Geo-Region: <locationData.region || "">`
  - `X-Geo-Country: <locationData.country || "">`
  - `X-Geo-Timezone: <locationData.timezone || "">`
  - `X-Request-ID: <requestId>` (computed from `commonUtils.getRequestId(req)` at api/search.js:68)
- **Query params:** `params: req.query` is passed through wholesale to axios (api/search.js:165). The proxy adds nothing and removes nothing. Specific param names are not enumerable from proxy code — they are whatever the FE caller sent.
- **Response handling:** Body returned to client unmodified via `res.send(response.data)` (api/search.js:258). `extractResultCount` (api/search.js:43-54) parses `totalMatching">N<` from the HTML for analytics only — does not modify the response sent to the FE.

### Shape 2 — `server` handler / deprecated `/proxy/funnelback` (api/server.js)

CLAUDE.md flags `server.js` as "does nothing meaningful today" and on
the deprecation watchlist. `vercel.json:4` still routes
`/proxy/funnelback` → `api/server.js`, so the wiring exists; whether
the route is called in practice is not determinable from proxy code
alone.

- **Method / timeout:** GET, 5000 ms (api/server.js:26, api/server.js:105-109)
- **URL declaration:** api/server.js:82
- **Headers (api/server.js:95-102):**
  - `Accept: text/html` (static)
  - `X-Forwarded-For: <userIp>` (computed via inline header chain at api/server.js:71-74 — does NOT use `commonUtils.extractClientIp`)
  - `X-Geo-City: <locationData.city>` (no `|| ""` fallback — sends literal `undefined` string if absent)
  - `X-Geo-Region: <locationData.region>`
  - `X-Geo-Country: <locationData.country>`
  - `X-Geo-Timezone: <locationData.timezone>`
  - **No** `X-Original-Client-Ip`, `X-Real-Ip`, or `X-Request-ID` (unlike `search-handler`)
- **Query params (api/server.js:85-90):** Constructed as `{ collection: 'seattleu~sp-search', profile: '_default', form: 'partial', ...req.query }` — proxy injects three defaults that `req.query` can override.
- **Response handling:** Body returned unmodified via `res.send(response.data)` (api/server.js:183). `extractResultCount` parsed for analytics only (api/server.js:41-52).

### Shape 3 — `spelling-handler` (api/spelling.js)

- **Method / timeout:** GET, 5000 ms (api/spelling.js:26, api/spelling.js:126-130)
- **URL declaration:** api/spelling.js:100
- **Headers (api/spelling.js:116-123):**
  - `Accept: text/html` (static)
  - `X-Forwarded-For: <userIp>` (computed via inline header chain at api/spelling.js:75-78)
  - `X-Geo-City: <locationData.city>`
  - `X-Geo-Region: <locationData.region>`
  - `X-Geo-Country: <locationData.country>`
  - `X-Geo-Timezone: <locationData.timezone>`
  - **No** `X-Original-Client-Ip`, `X-Real-Ip`, or `X-Request-ID`
- **Query params (api/spelling.js:102-107):** Constructed as a `URLSearchParams` from `{ ...req.query, collection: 'seattleu~sp-search', profile: '_default', form: 'partial' }` — proxy injects three defaults that override anything in `req.query` (note the spread order is reversed from `server.js`).
- **Response handling:** Body returned unmodified via `res.send(response.data)` (api/spelling.js:212). `extractSpellingSuggestions` (api/spelling.js:41-59) parses `class="spelling">Did you mean:N<` for analytics only.

---

## `https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json`

### Shape 4 — `suggest-handler` (api/suggest.js)

- **Method / timeout:** GET, 3000 ms (api/suggest.js:31, api/suggest.js:420-424)
- **URL declaration:** api/suggest.js:386-387
- **Headers (api/suggest.js:391-404):**
  - `Accept: text/html` (static — note that the URL is `.json`)
  - `X-Forwarded-For: <clientIp>` (via `commonUtils.extractClientIp`)
  - `X-Original-Client-Ip: <clientIp>`
  - `X-Real-Ip: <clientIp>`
  - `X-Geo-City: <locationData.city || "">`
  - `X-Geo-Region: <locationData.region || "">`
  - `X-Geo-Country: <locationData.country || "">`
  - `X-Geo-Timezone: <locationData.timezone || "">`
  - `X-Request-ID: <requestId>`
- **Query params:** `params: req.query` passed through wholesale (api/suggest.js:421).
- **Response handling:** Coerced to array (api/suggest.js:434), then run through `enrichSuggestions(responseData, req.query, requestId)` (api/suggest.js:437) which adds metadata to each suggestion before sending. Cached on the way out via `setCachedData("suggestions", req.query, enrichedResponse, requestId)` (api/suggest.js:442-447).

---

## `https://dxp-us-search.funnelback.squiz.cloud/s/search.json`

Hit by two handlers with two different shapes. Note: this URL is the
JSON endpoint of the `search` collection, and is used here by the two
suggest-* sibling handlers — not by `search.js` (which uses
`/s/search.html`).

### Shape 5 — `suggest-people` (api/suggestPeople.js)

- **Method / timeout:** GET, 3000 ms (api/suggestPeople.js:30, api/suggestPeople.js:373-376)
- **URL declaration:** api/suggestPeople.js:318-319 (base) + api/suggestPeople.js:340 (final URL with hand-built query string concatenated)
- **Headers (api/suggestPeople.js:344-357):**
  - `Accept: text/html` (static — URL is `.json`)
  - `X-Forwarded-For: <clientIp>` (via `commonUtils.extractClientIp`)
  - `X-Original-Client-Ip: <clientIp>`
  - `X-Real-Ip: <clientIp>`
  - `X-Geo-City: <locationData.city || "">`
  - `X-Geo-Region: <locationData.region || "">`
  - `X-Geo-Country: <locationData.country || "">`
  - `X-Geo-Timezone: <locationData.timezone || "">`
  - `X-Request-ID: <requestId>`
- **Query params (api/suggestPeople.js:331-340):** Built by hand-concatenating an array of pre-encoded strings into a query string and appending it to the URL. axios is called with no `params` option (api/suggestPeople.js:373-376), so `req.query` is **not** forwarded except for `query` (extracted at api/suggestPeople.js:334). Sent params:
  - `form=partial` (hardcoded)
  - `profile=_default` (hardcoded)
  - `query=<encodeURIComponent(req.query.query || "")>` (computed)
  - `f.Tabs|seattleu~ds-staff=Faculty & Staff` (hardcoded; literally `f.Tabs%7Cseattleu%7Eds-staff=Faculty+%26+Staff` on the wire)
  - `collection=seattleu~sp-search` (hardcoded)
  - `num_ranks=5` (hardcoded)
- **Response handling:** Maps `response.data.response.resultPacket.results` to a flat array of person objects (api/suggestPeople.js:386 onward), with `cleanTitle` applied to several `listMetadata` fields. Sent as JSON.
- **Notes:** `URLSearchParams` `params` object built at api/suggestPeople.js:322-328 is **never used** — it is constructed and discarded. Its values diverge from the `queryString` actually sent: line 326 says `'f.Tabs|seattleu|Eds-staff'` (pipe + capital E + literal pipe between segments) while the encoded `queryString` decodes to `f.Tabs|seattleu~ds-staff` (pipe + tilde + lowercase d). The `queryString` form is the one on the wire; the `params` form is dead code.

### Shape 6 — `suggest-programs` (api/suggestPrograms.js)

- **Method / timeout:** GET, 3000 ms (api/suggestPrograms.js:34, api/suggestPrograms.js:393-397)
- **URL declaration:** api/suggestPrograms.js:360-361
- **Headers (api/suggestPrograms.js:365-379):**
  - `Accept: application/json` (static — only handler that sends `application/json` rather than `text/html`)
  - `Content-Type: application/json` (static — only handler that sets a `Content-Type` on a GET; no body is sent)
  - `X-Forwarded-For: <clientIp>` (via `commonUtils.extractClientIp`)
  - `X-Original-Client-Ip: <clientIp>`
  - `X-Real-Ip: <clientIp>`
  - `X-Geo-City: <locationData.city || "">`
  - `X-Geo-Region: <locationData.region || "">`
  - `X-Geo-Country: <locationData.country || "">`
  - `X-Geo-Timezone: <locationData.timezone || "">`
  - `X-Request-ID: <requestId>`
- **Query params (api/suggestPrograms.js:239-245):** Constructed as `{ ...req.query, collection: 'seattleu~ds-programs', profile: '_default', num_ranks: 5, form: 'partial' }` — proxy injects four defaults that override any matching keys in `req.query`. Passed to axios via `params: query` (api/suggestPrograms.js:394).
- **Response handling:** Wrapped into `{ metadata: {...}, programs: [...] }` (api/suggestPrograms.js:407-433). `metadata` pulls `totalMatching`/`queryTime` from `response.data.response.resultPacket.resultsSummary`. `programs` maps `response.data.response.resultPacket.results` to a flat object per program, with `cleanProgramTitle` on titles.

---

## `https://dxp-us-search.funnelback.squiz.cloud/s/${req.query.path}`

### Shape 7 — `tools-dynamic` (api/tools.js)

- **Method / timeout:** GET, 5000 ms (api/tools.js:26, api/tools.js:101-105)
- **URL construction (api/tools.js:80, api/tools.js:81, api/tools.js:101):**
  - Base: `https://dxp-us-search.funnelback.squiz.cloud/s`
  - Path slot: `${req.query.path || ''}`
  - Final: `${funnelbackUrl}/${toolPath}`
- **Headers (api/tools.js:91-98):**
  - `Accept: text/html` (static)
  - `X-Forwarded-For: <userIp>` (computed via inline header chain at api/tools.js:49-52 — does NOT use `commonUtils.extractClientIp`)
  - `X-Geo-City: <locationData.city>`
  - `X-Geo-Region: <locationData.region>`
  - `X-Geo-Country: <locationData.country>`
  - `X-Geo-Timezone: <locationData.timezone>`
  - **No** `X-Original-Client-Ip`, `X-Real-Ip`, or `X-Request-ID`
- **Query params:** `params: req.query` passed through wholesale to axios (api/tools.js:102). Note that `req.query.path` is read both as the URL path slot (api/tools.js:81) **and** is also still present in the params object passed to axios — `path` is sent twice, once in the URL and once as a query parameter.
- **Response handling:** Body returned unmodified via `res.send(response.data)` (api/tools.js:185).
- **Notes:** Per CLAUDE.md, `tools.js` provides functionality that is part of the working search system end users see; the file/shape are current-system reference, not rebuild requirements.

---

## Out of inventory (documented for completeness)

### `api/suggest.js.new` — dead file

Contains a second shape pointed at `/s/suggest.json` (line 205) with
`Accept: application/json` and `X-Forwarded-For` only (lines 213-219).
`vercel.json` has no rewrite to it; not wired in. Documented here only
because the grep for `funnelback.squiz.cloud` matched it. Per
CLAUDE.md, this file is on the deprecation watchlist as "dead file,
never wired in" — so the proxy does not actually send this shape.

### `lib/geoIpService.js` — non-Funnelback external call

`lib/geoIpService.js:179` calls `axios.get` against
`http://ip-api.com/json/${ip}` for GeoIP enrichment. Not a Funnelback
endpoint; out of scope for this audit. Mentioned only because the
grep for `axios.` matched it.

### Edge middleware (`middleware.js`)

`middleware.js:226` and `middleware.js:461` call `fetch(request)` /
`fetch(newRequest)` — these forward the inbound request through
Vercel's edge chain to the matching `/api/*` handler. Not Funnelback
calls.

---

## Observed cross-cutting patterns (factual, not classificatory)

These are present-tense observations about the seven request shapes,
useful for retrieval but not constituting analysis:

- **Five distinct URLs in seven shapes:** three shapes hit
  `/s/search.html`, two shapes hit `/s/search.json`, one shape hits
  `/s/suggest.json`, one shape uses dynamic `/s/${path}`.
- **Two timeout values:** 3000 ms for the three suggest-family
  handlers (api/suggest.js, api/suggestPeople.js,
  api/suggestPrograms.js); 5000 ms for the four others (api/search.js,
  api/server.js, api/spelling.js, api/tools.js).
- **`Accept` header:** six of seven shapes send `text/html`; only
  `suggest-programs` sends `application/json` (and is also the only
  shape sending `Content-Type: application/json` on a GET with no
  body).
- **Two IP-extraction paths:** the four newer handlers (search,
  suggest, suggestPeople, suggestPrograms) call
  `commonUtils.extractClientIp(req)`; the three older handlers
  (server, spelling, tools) inline the same header-priority chain.
- **Two header-set variants:** the four newer handlers send
  `X-Original-Client-Ip`, `X-Real-Ip`, and `X-Request-ID` in addition
  to `X-Forwarded-For` and the four `X-Geo-*` headers. The three older
  handlers (server, spelling, tools) send only `X-Forwarded-For` plus
  the four `X-Geo-*` headers, and the four newer ones use
  `<value || "">` fallbacks for the `X-Geo-*` set while the three
  older ones do not.
- **Three forwarding patterns for `req.query`:**
  - **Pass-through:** search, suggest, tools — `params: req.query`
    sent as-is.
  - **Inject-defaults:** server, spelling, suggestPrograms — spread
    `req.query` together with hardcoded defaults; the order of the
    spread differs (server has `req.query` last and so client wins;
    spelling and suggestPrograms have `req.query` first and so
    hardcoded values win for `collection`, `profile`, `form`, and
    `num_ranks` where applicable).
  - **Hand-built query string:** suggestPeople — ignores most of
    `req.query`, sends a fixed set of six params with only `query`
    forwarded from the client.

---

## Open gaps

Items proxy code alone cannot resolve. Listed here per the audit
brief; not for resolution in this work.

- Whether `Accept: text/html` on `/s/suggest.json` (api/suggest.js,
  api/suggestPeople.js) is required by Funnelback or vestige.
- Whether `Content-Type: application/json` on a GET request with no
  body (api/suggestPrograms.js) has any effect on Funnelback's
  handling.
- Whether the divergence between `X-Geo-*` `|| ""` fallbacks (newer
  handlers) and bare-undefined values (older handlers) produces any
  Funnelback-side behavior difference.
- Whether sending `req.query.path` both as a URL path segment and as
  a query parameter (api/tools.js) is intended.
- Enumeration of `req.query.path` values that flow into `tools.js`
  cannot be derived from proxy code; FE-side audit out of scope.
- Whether the `/proxy/funnelback` → `api/server.js` route is exercised
  by any active caller (CLAUDE.md says `server.js` "does nothing
  meaningful today"; the rewrite is still present in vercel.json).
- The full set of query parameter names that flow through the
  pass-through handlers (search, suggest, tools) cannot be enumerated
  from proxy code — they are whatever the FE sends.
