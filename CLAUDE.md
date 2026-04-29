# CLAUDE.md — funnelback-proxy-dev

This file is auto-loaded into every Claude Code session in this repo. It establishes how to work in this codebase during the rebuild discovery phase, the foundational decisions that frame the rebuild project, and the discoveries about this system that should be treated as ground truth without re-deriving them each session.

## Posture

This repo is a **frozen working system under structured observation**. The current phase is discovery and audit — observing the existing system carefully so that the architectural principles guiding the rebuild can be informed rather than naive. Claude Code's role here is read-only traversal and analysis. Findings flow back to the architectural conversation in chat, where they feed into pattern recognition and the principles work that will guide later decisions.

Specifically:

- **No edits, no commits, no PRs, no deploys.** The repo-local `.claude/settings.json` enforces `defaultMode: plan` and denies write tools, git mutations, and deploy commands. This is intentional and not a temporary inconvenience to work around.
- **Findings are observations, not requirements.** This phase is several steps removed from setting rebuild requirements. The chain is: findings inform pattern recognition, pattern recognition feeds principles, principles will guide decisions later, and decisions will yield requirements eventually. Audit output should not skip steps by phrasing observations as commitments.
- **External constraints bind; internal precedent is reference.** What binds the rebuild comes from outside the current system: Funnelback's request and response shapes, T4's HTML contract, browser and network capabilities, and the user-facing functionality the working search system currently delivers to end users. Internal choices this proxy made — file names, file boundaries, handler shapes, library placements — are reference for understanding what exists, not requirements that the rebuild must preserve. Audit findings should distinguish "this functionality is required to keep working" from "this file/structure exists in the current system."
- **No fixes-in-place.** If something here is broken or suboptimal, the response is to capture the observation, not to fix it. The current proxy must remain stable and deployable through discovery.
- **Pure research tasks don't require plan files.** When `ExitPlanMode` would write to a blocked path, deliver the audit content directly in the response.

## Foundational decisions that frame this work

These are settled. They are the reason the project exists and the platform on which it will be built. Audit recommendations that contradict these are out of scope.

**The A/B topology is retired in the rebuild.** This is foundational — A/B's operational clumsiness is a reason this project exists. During discovery, the existing four-app A/B system remains operational and must not be disrupted. The endpoint-pairing rule still applies during the freeze period: `funnelback-proxy-dev` only serves `su-search-dev`, `funnelback-proxy` only serves `su-search`.

**The rebuild is Vercel-native and evergreen.** Vercel serverless, Next.js, Vercel-marketplace-integration caching (Upstash or equivalent), vendor-managed HA via Vercel and Upstash primitives. The Pro plan is already in place and the rebuild does not affect budget. AWS, OpenSearch, ElastiCache, and any other non-Vercel infrastructure framings that may appear in older session reports are aspirational language that did not stick — not direction. Audit recommendations should not propose AWS or OpenSearch as solutions for any finding here.

**The proxy cache is rebuilt from scratch in the rebuild, not fixed in place.** This decision flows from the discovery (below) that the current proxy cache was never a deliberately-architected working design. Audit work on the cache here is for understanding, not for informing repair.

**Rate limiting is preserved into the rebuild.** The edge middleware in `middleware.js` has 18 months of production with zero incidents. It is a solved problem and not on the table for redesign. Note that "preserved" refers to the functionality and the underlying approach, not necessarily the file or its current shape — see the external-constraints-vs-internal-precedent principle above.

**MongoDB writer rule for the rebuild: proxy-only, one writer.** The implementation (shared module, event bus, middleware interception, or another approach) is an open design question. The rule itself is fixed: no front-end MongoDB writes, and one writer in the proxy serving all handlers.

**This project is self-contained.** Other session reports — particularly the April 27 cache-rebuild report — are informational inputs about the operating environment, not commitments. Where they conflict with v6 project instructions or with the April 20, 22, and 24 session notes, the project documents win.

## What this proxy is

A Vercel serverless app, Node.js, JavaScript (not TypeScript). Sits between the front end (`su-search-dev`) and three upstream services: Funnelback search, a Squiz suggestions server, and MongoDB Atlas (for query logging). The proxy fans out to those upstreams, applies caching where relevant, and writes analytics records.

## Functionality currently implemented under `api/`

The list below describes what the current proxy implements, not what the rebuild must preserve in this shape. File names, file boundaries, handler shapes, and library placements are current-system reference. What's required is that the user-facing functionality these handlers deliver continues to work in the rebuild — how the rebuild structures the code that delivers it is an open architectural question.

- `search.js` — main Funnelback search functionality.
- `suggest.js` — general autocomplete suggestions.
- `suggestPeople.js` — people-tab autocomplete.
- `suggestPrograms.js` — programs-tab autocomplete.
- `spelling.js` — spelling suggestions.
- `tools.js` — Funnelback "tools" surface. Discovery from the April 20 session: this provides functionality that is part of the working search results system end users see. The rebuild must solve for that functionality, just as it must solve for every other piece of a higher-ed Funnelback search system. The file itself, its name, and its current shape are current-system reference — the rebuild's solution may live anywhere in its structure, including folded into another handler or restructured beyond recognition. What's required is that the user-facing tools functionality continues to work; how the rebuild delivers that is open.

## Deprecation watchlist (do not extend, rebuild, or treat as direction)

Functionality present in this repo that is explicitly out of scope for the rebuild — the rebuild does not need to solve for any of these:

- `server.js` — original `/proxy/funnelback` main handler. Does nothing meaningful today.
- `api/analytics/click.js`, `api/analytics/clicksBatch.js`, `api/analytics/supplement.js` — analytics endpoints. The "Privacy-First Analytics" framing in the README is historical product positioning, not direction. The underlying city-level GeoIP enrichment in `lib/geoIpService.js` is preserved into the rebuild as functionality; the dashboard-facing analytics endpoints are not.
- `api/queryCount.js`, `api/mongoTest.js`, `api/testAnalytics.js` — test/diagnostic endpoints.
- `api/migrate-ttl.js` and `migrate-ttl-script.js` — one-off migration utility, run-once tooling.
- `api/suggest.js.new` — dead file, never wired in.
- `install-analytics.sh`, `install-analytics.sh.save` — install scripts, including editor crud.

## Discoveries to treat as ground truth

These have been established in prior sessions. Audit work doesn't need to re-derive them; it can build on them.

**Shared-core handler pattern exists in latent form.** `search.js` and `suggest.js` have near-identical structure (Funnelback request shape, response shape, caching, logging, error handling). The pattern is observable in the code today. What the rebuild does with this observation is a later question.

**The proxy cache was never a deliberately-architected working design.** It is not a previously-functional system that broke. It broke incidentally during front-end development and was never reverted because the front-end cache proved sufficient on its own. The relevant code lives in `lib/cacheService.js` and `lib/redisClient.js`, plus references from the cache-using handlers.

**Two cache layers operate on different TTL philosophies.** The front-end cache (in `su-search-dev`) operates on crawl-cadence-aligned TTLs (12-hour default, deliberate). The proxy cache, when it last attempted to operate, used content-type-driven TTLs. How the rebuild handles this is for the principles work to consider; here it's the observation.

**Rate-limiting middleware has clean operational data.** April 24 firewall sample: 180k allowed, 24 denied, 0 challenged, 0 false positives. The edge middleware is operating cleanly.

**MongoDB writes are per-handler.** Each handler writes its own MongoDB record via `lib/queryAnalytics.js`. Whether all handlers' write paths are uniform or whether there are exceptions is an open audit question.

**Three-suggest-endpoint naming asymmetry.** `suggest`, `suggestPeople`, `suggestPrograms` use camelCase suffixes for two of three (no path separator, no consistent shape). Observable today; what to do with it is a later question.

**No tests exist.** The "Recommended Testing" section in the proxy README is aspirational. Test framework choice and CI design are open.

## Working heuristics

**Simpler than it looked.** When something in this codebase looks more complex than it should be, the higher-probability hypothesis is historical residue rather than active architectural commitment. The April 22 grep findings on `su-search-dev` confirmed this pattern: Express dependencies were inert, MongoDB access was simpler than feared, the FE script loading was load-bearing in a particular way. Apply the same prior here.

**Builder-organizing-expertise framing.** This rebuild project is undertaken by the person who built the current system. Where the code and the user's recollection conflict, the user's recollection is the more authoritative source of *why* something exists or *what it was supposed to do*. The code is the authoritative source of *what is currently happening*. Audit work reconciles those.

**No time pressure.** Discovery proceeds at the pace evidence supports. Audits should be thorough rather than fast.

## Out of scope for this repo

- Front-end code (lives in `su-search-dev`). Cross-cutting questions surface here, but FE-side changes do not.
- T4 templating. The proxy never sees T4. The HTML contract is a `su-search-dev` concern.
- Funnelback profile / collection configuration. That lives in Funnelback's admin surface.
- Squiz suggestions server configuration. External, opaque to this repo.

## Working with chat

Audit findings come back to the architectural conversation. The chat agent has the v6 project instructions, the April 20, 22, and 24 session notes, and the architectural decisions taken in those sessions as standing context. Don't re-derive direction in audit output; defer architectural calls to chat. The audit's job is grounded observation; chat's job is synthesis into the principles work that will guide later decisions.
