# Blackllama Wiki Cleanup Audit Backlog

Date: 2026-07-01
Repo: `manosdvd/blackllama-wiki`
Scope: diagnostic, debug, cleanup, performance, mobile aesthetics, and best-practice functionality audit.

This file intentionally does **not** change app behavior. It is a handoff document for future human or multi-agent cleanup work.

---

## 0. Current Audit Limits

This audit was performed from repository file inspection through GitHub connector access. Code search was not indexed for this repo at the time of review, and the local sandbox could not clone GitHub due blocked outbound DNS. No local `npm install`, `npm run lint`, `npm run build`, or browser smoke test was run.

Future work should start by cloning locally and running:

```bash
npm ci
npm run lint
npm run build
npm run typecheck # add this script first; see task Q-002
```

---

## 1. High-Level Diagnosis

The project has a strong concept: a Camp Lawton staff hub with an offline-first wiki, operational alerts, a camp-flavored ticker, onboarding/application flows, forum/moderation, Firebase auth/data, and a rustic command-center visual style.

The code currently looks like a prototype that has been pushed toward production in several directions at once. That is normal for fast AI-assisted iteration, but it now needs a cleanup pass before more features are added.

Main problems:

1. **Global header work is too heavy.** Weather, alerts, auth, ticker, realtime Firestore, canvas animation, timers, and sync calls all live near the top of every route.
2. **Live ticker sync is triggered by ordinary clients.** The client ticker calls `/api/ticker/sync` on page load and hourly, while the sync route mutates Firestore and calls Gemini.
3. **Several pages are visual prototypes with mock data.** Wiki, forum, moderation, admin review, and application flows look real but do not yet have a real data model or safe persistence path.
4. **Authentication exists, but route authorization is not enforced.** Admin and moderation pages are routable without server-side protection.
5. **CSS design tokens are inconsistent.** Several components reference variables not defined globally.
6. **Mobile mode is under-designed.** The mobile menu button does not open a menu, alert/weather layout is crowded, and the ticker truncates instead of revealing full entries.
7. **Generated PWA/service-worker output appears committed.** This creates noisy diffs and can preserve stale build IDs.
8. **There is no meaningful test/check pipeline beyond lint.** The repo needs typecheck/build/CI/smoke coverage before deeper refactors.

---

## 2. Execution Order for a Snappier, Cleaner Site

Do not start by restyling everything. Start by reducing uncertainty and cutting global work.

### Phase 1 — Safety and repo hygiene

Goal: make future changes safer and less noisy.

- Add explicit scripts for `typecheck`, `build`, and optionally `test`.
- Add a minimal CI workflow that runs install, lint, typecheck, and build on pull requests.
- Remove committed generated PWA output from source control if it is build-generated.
- Add `.env.example` documenting required environment variables without secrets.
- Define the missing global design tokens currently referenced by CSS modules.

### Phase 2 — Separate prototype UI from real features

Goal: prevent fake screens from behaving like production features.

- Mark mock/prototype pages clearly or move static mock data to fixtures.
- Create typed data models for users, roles, articles, topics, posts, applications, onboarding statuses, ticker items, and alerts.
- Decide which features are public, candidate-only, staff-only, moderator-only, and admin-only.

### Phase 3 — Fix global header execution order

Goal: make every page feel faster.

- Render brand/nav shell immediately.
- Defer non-critical widgets: ticker, alerts/weather detail, auth dropdown, ember animation.
- Stop client-triggered ticker sync. Ordinary visitors should only read cached feed data.
- Move weather and alert fetching behind cached server routes.
- Respect `prefers-reduced-motion` for ticker, HUD pulses, and embers.

### Phase 4 — Make core wiki real before side features

Goal: prioritize the main content experience.

- Build the wiki index/article/edit flow around Firestore or another chosen content backend.
- Add permissions for edit/publish/review.
- Implement autosave/draft/publish status intentionally.
- Leave forum/apply/onboarding as secondary until wiki content is trustworthy.

### Phase 5 — Mobile aesthetics and usability

Goal: make phone use pleasant instead of cramped.

- Implement an actual mobile nav drawer or bottom action bar.
- Redesign AlertsHUD for compact stacked mobile layout.
- Make Camp Feed a button/openable feed panel and make single-item mobile ticker text scroll/reveal full entries.
- Normalize card spacing, borders, shadows, and typography scale.

### Phase 6 — PWA/offline polish

Goal: cache the right things, not everything.

- Cache wiki content and static shell intentionally.
- Do not treat live safety/weather data as reliable offline truth unless clearly labeled stale.
- Add stale age labels and refresh controls.
- Verify service worker lifecycle after removing generated artifacts from git.

---

## 3. Priority Backlog

Priority scale:

- **P0**: required before production or broader testing
- **P1**: high-impact cleanup/performance/user trust
- **P2**: polish or follow-up hardening

### P0 — Stop user-triggered live ticker mutation

**Task ID:** TICKER-001  
**Owner type:** backend/frontend pair  
**Files:**

- `src/components/layout/Ticker.tsx`
- `src/app/api/ticker/sync/route.ts`
- `src/components/admin/TickerSyncButton.tsx`

**Problem:**

`Ticker.tsx` subscribes to Firestore and also calls `/api/ticker/sync` on load and hourly. The sync route fetches RSS, calls Gemini, deletes old Firestore documents, and writes new ones. This means normal visitors can indirectly trigger expensive mutation work.

**Recommended work:**

1. Change `/api/ticker/sync` from `GET` to `POST`.
2. Require admin auth or a server-only cron secret.
3. Remove auto-sync from `Ticker.tsx`.
4. Give `Ticker.tsx` a read-only data source: Firestore query, cached `/api/ticker/live`, or server-supplied props.
5. Keep manual sync behind `TickerSyncButton`, but require admin role and visible status.
6. Consider scheduled sync via hosting cron rather than client-driven polling.

**Acceptance criteria:**

- Loading the public app cannot trigger Gemini or Firestore writes.
- Ticker still renders cached/recent items.
- Admin can manually sync from a protected route.
- Network tab on page load shows read-only ticker traffic only.

---

### P0 — Protect admin and moderation routes

**Task ID:** AUTH-001  
**Owner type:** security/frontend pair  
**Files:**

- `src/components/auth/AuthContext.tsx`
- `src/app/admin/review/page.tsx`
- `src/app/admin/moderation/page.tsx`
- Add `middleware.ts` or server-side authorization helpers.
- Firestore security rules, if present outside this repo.

**Problem:**

Auth state and custom claims are read client-side, but admin/moderation routes render server pages without visible route-level authorization. Client UI hiding is not security.

**Recommended work:**

1. Define role matrix: Guest, Candidate, Onboarding Staff, Staff, Alumni, Moderator, Admin.
2. Enforce admin/moderator route access server-side.
3. Add unauthorized/forbidden pages or redirects.
4. Ensure Firestore rules match the same role model.
5. Do not expose admin controls based only on client-side state.

**Acceptance criteria:**

- Direct visit to `/admin/review` or `/admin/moderation` blocks unauthorized users.
- Admin users can access the routes after login.
- Role checks are centralized and testable.

---

### P0 — Remove or quarantine mock production screens

**Task ID:** DATA-001  
**Owner type:** product/frontend/backend  
**Files:**

- `src/app/wiki/page.tsx`
- `src/app/wiki/article/[id]/page.tsx`
- `src/app/forum/page.tsx`
- `src/app/forum/topic/[id]/page.tsx`
- `src/app/admin/review/page.tsx`
- `src/app/admin/moderation/page.tsx`
- `src/app/apply/page.tsx`
- `src/app/onboarding/page.tsx`

**Problem:**

Several routes contain hardcoded mock data and buttons/forms that appear functional. This is risky because users may trust screens that do not persist or reflect real state.

**Recommended work:**

1. Add a clear `Prototype` or `Coming Soon` state to mock-only pages until backend is connected.
2. Move mock data to `src/fixtures/` if it is still useful for UI development.
3. Add typed repository/service layer for real data.
4. Implement the wiki first because it is the core product.
5. Add submit handlers only when data path and permissions are designed.

**Acceptance criteria:**

- No page implies persistence when it does not persist.
- All mock data is isolated, named, and easy to delete later.
- Wiki route can be prioritized without forum/application scope creep.

---

### P0 — Repo hygiene: generated PWA artifacts

**Task ID:** REPO-001  
**Owner type:** repo maintenance/build  
**Files:**

- `public/sw.js`
- `public/workbox-*.js` if present
- `.gitignore`
- `next.config.ts`

**Problem:**

Generated service-worker output appears to be committed. It includes build-specific `_next/static/...` paths and causes noisy diffs after builds. `.gitignore` ignores `.next/` and `out/`, but not generated PWA files in `public/`.

**Recommended work:**

1. Confirm whether `@ducanh2912/next-pwa` writes `public/sw.js` and `public/workbox-*.js` during build.
2. If yes, remove generated files from git and add ignore rules.
3. Keep hand-authored public assets like manifest/icons/logo.
4. Verify production build still emits a working service worker.

**Acceptance criteria:**

- Running a build does not dirty the working tree with generated service worker files.
- Service worker still registers in production.
- PWA behavior is tested after deployment.

---

### P0 — Add baseline validation pipeline

**Task ID:** Q-001  
**Owner type:** quality/build  
**Files:**

- `package.json`
- Add `.github/workflows/ci.yml`

**Problem:**

Current scripts expose `dev`, `build`, `start`, and `lint`, but no dedicated `typecheck` or test script. This makes refactors more dangerous.

**Recommended work:**

1. Add `typecheck`: `tsc --noEmit`.
2. Add a CI workflow for pull requests: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`.
3. Add smoke tests later, but do not block on them for phase 1.

**Acceptance criteria:**

- Every PR gets lint/type/build feedback.
- Failing build blocks merge.
- Future agents have a reliable safety net.

---

## 4. Performance and Execution-Order Backlog

### P1 — Make the header shell render fast

**Task ID:** PERF-001  
**Files:**

- `src/app/layout.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/AlertsHUD.tsx`
- `src/components/layout/Ticker.tsx`
- `src/components/ui/EmbersBackground.tsx`

**Problem:**

The root layout always mounts AuthProvider, EmbersBackground, Header, AlertsHUD, and Ticker. The header then loads offline ticker items server-side. AlertsHUD runs multiple client fetches and timers. Ticker imports Firebase client SDK. EmbersBackground runs a canvas animation forever.

**Recommended work:**

1. Split `Header` into:
   - `HeaderShell` — static/nav/brand only.
   - `DeferredAlertsHUD` — lazy loaded after first paint or after idle.
   - `DeferredTicker` — lazy loaded after initial shell.
2. Consider route groups: wiki reading routes may need content first, not global widgets first.
3. Lazy load EmbersBackground after idle and disable for reduced motion.
4. Avoid layout-level realtime Firebase unless every route truly needs it.

**Acceptance criteria:**

- First meaningful content does not wait on weather/ticker/network calls.
- Reduced-motion users do not get continuous canvas/ticker animation.
- Mobile load feels like app shell first, flavor widgets second.

---

### P1 — Replace browser-side weather fetches with cached server endpoints

**Task ID:** PERF-002  
**Files:**

- `src/components/layout/AlertsHUD.tsx`
- `src/app/api/alerts/coronado/route.ts`
- Add `src/app/api/weather/lawton/route.ts` or similar.

**Problem:**

AlertsHUD fetches NWS active alerts directly from the browser, calls the Coronado route, then fetches detailed NWS forecast directly, all from a global component. It repeats every five minutes per client.

**Recommended work:**

1. Add a cached server route that combines NWS alerts, NWS forecast, and Coronado alerts.
2. Use `next: { revalidate: 300 }` or similar server-side caching.
3. Let the client fetch one lightweight JSON endpoint.
4. Add `staleAt`/`fetchedAt` metadata.
5. Keep localStorage fallback, but label stale data clearly.

**Acceptance criteria:**

- AlertsHUD makes one app-origin request, not multiple third-party requests.
- Server cache prevents every visitor from hammering public APIs.
- Offline cache includes visible age/staleness language.

---

### P1 — Ticker rendering efficiency

**Task ID:** PERF-003  
**Files:**

- `src/components/layout/Ticker.tsx`
- `src/components/layout/Ticker.module.css`

**Problem:**

Ticker duplicates all combined items in the DOM and uses `requestAnimationFrame` to mutate `scrollLeft`. This can be okay for a small list, but it is unnecessary work in a global header and does not respect reduced motion.

**Recommended work:**

1. Use CSS transform animation for desktop ticker if possible.
2. Pause on hover/focus and when document is hidden.
3. Respect `prefers-reduced-motion` by switching to manual controls or slow non-animated display.
4. Limit rendered items to a safe window if live feed grows.
5. Add keyboard-accessible controls and real labels.

**Acceptance criteria:**

- No continuous JS scroll loop is required for normal desktop ticker motion.
- Ticker remains usable without animation.
- Mobile displays full entry by scroll/reveal rather than clipping.

---

### P1 — Avoid heavy Firebase imports globally where possible

**Task ID:** PERF-004  
**Files:**

- `src/lib/firebase/client.ts`
- `src/components/auth/AuthContext.tsx`
- `src/components/layout/Ticker.tsx`

**Problem:**

The client Firebase SDK is pulled into the app shell through auth and ticker. Ticker also subscribes to a full Firestore collection without ordering or limiting.

**Recommended work:**

1. Keep auth global only if most routes need it immediately; otherwise defer auth UI.
2. For ticker, prefer server-provided cached data or a small `/api/ticker/live` endpoint.
3. If Firestore remains client-side, query with `orderBy`, `limit`, and a known schema.
4. Add error callbacks to realtime subscriptions.

**Acceptance criteria:**

- Firebase read/write paths are intentional, typed, and minimal.
- Header does not subscribe to unbounded collections.

---

## 5. Camp Feed / Ticker Feature Backlog

### P1 — Camp Feed button and floating feed window

**Task ID:** TICKER-002  
**Files:**

- `src/components/layout/Ticker.tsx`
- `src/components/layout/Ticker.module.css`
- Consider new component: `src/components/layout/CampFeedPanel.tsx`

**Recommended work:**

1. Change the `CAMP FEED` label into a real button.
2. Clicking opens a floating panel/modal/sheet listing all current ticker items.
3. Panel should include source, category, title, and link.
4. Desktop: anchored popover under ticker label or top-right sheet.
5. Mobile: bottom sheet with scrollable list and large tap targets.
6. Add Escape-to-close, outside-click close, focus trap, and `aria-modal` if modal.

**Acceptance criteria:**

- Users can view all ticker items without waiting for rotation.
- Keyboard and screen-reader users can open/close/read the feed.
- External links behave predictably.

---

### P1 — Mobile single-item ticker should reveal full text

**Task ID:** TICKER-003  
**Files:**

- `src/components/layout/Ticker.tsx`
- `src/components/layout/Ticker.module.css`

**Problem:**

The current mobile ticker line-clamps to one line and hides overflow. That prevents full entry text from being read.

**Recommended work:**

1. Remove `-webkit-line-clamp: 1` for mobile ticker entries.
2. Use one of these patterns:
   - horizontal marquee inside the single active item, or
   - tap-to-expand item, or
   - two-line layout with animated reveal if text overflows.
3. Preserve manual previous/next buttons.
4. Pause auto-rotation while an item is being interacted with.

**Acceptance criteria:**

- Long ticker entries are readable on phones.
- The display does not jump vertically in a distracting way.
- The ticker remains compact enough for a sticky header.

---

### P1 — Implement ticker feed rules instead of only storing them

**Task ID:** TICKER-004  
**Files:**

- `tickerFeeds.json`
- `src/lib/tickerUtils.ts`
- `src/app/api/ticker/sync/route.ts`

**Problem:**

`tickerFeeds.json` contains strong display rules, content policy, source mix, category weights, dedupe window, and source-label settings. The current code only partially uses the data.

**Recommended work:**

1. Add a typed parser for `tickerFeeds.json`.
2. Validate required URLs and enabled items.
3. Enforce max character length, source label visibility, category allowlist, exclude keywords, dedupe, and category spacing.
4. Do not let Gemini invent current factual data that should come from authoritative sources.
5. Add unit tests for feed filtering and rotation.

**Acceptance criteria:**

- Feed behavior matches the rules in `tickerFeeds.json`.
- Bad/missing feed entries are caught at build or sync time.
- Ticker can produce broad-audience-safe output without manual babysitting.

---

### P1 — Do not ask Gemini to browse or determine current facts without sources

**Task ID:** TICKER-005  
**Files:**

- `src/app/api/ticker/sync/route.ts`

**Problem:**

The ticker sync prompt asks Gemini to determine current flag status, current national day, Scouting updates, local status/facts, etc. A generative model call is not a reliable live lookup unless fed verified source data.

**Recommended work:**

1. Split current-fact collection into deterministic fetchers.
2. Feed Gemini only verified source snippets and ask for shortening/rephrasing.
3. For items like flag status and National Day, either fetch authoritative source pages/API or remove them until verified.
4. Add `sourceUrl` and `generatedFrom` metadata.
5. Add fallback copy when sources fail.

**Acceptance criteria:**

- Live ticker current facts are traceable to actual URLs/data.
- Gemini output cannot silently hallucinate source-backed operational facts.

---

## 6. Data Model and Feature Backlog

### P1 — Define application data models

**Task ID:** DATA-002  
**Files:**

- Add `src/types/` or `src/lib/models/`
- Firestore rules/config if available

**Recommended models:**

- `UserProfile`
- `RoleAssignment`
- `WikiArticle`
- `WikiRevision`
- `ArticleCategory`
- `Application`
- `OnboardingTask`
- `OnboardingStatus`
- `ForumCategory`
- `ForumTopic`
- `ForumPost`
- `ModerationFlag`
- `AuditLogEntry`
- `TickerItem`
- `AlertSnapshot`

**Acceptance criteria:**

- Mock screens can be replaced with real typed data gradually.
- Firestore collection names and field names are documented before more UI is built.

---

### P1 — Prioritize real wiki reading experience

**Task ID:** WIKI-001  
**Files:**

- `src/app/wiki/page.tsx`
- `src/app/wiki/article/[id]/page.tsx`
- `src/app/wiki/edit/page.tsx`
- `src/components/wiki/Editor.tsx`

**Problem:**

The wiki is described as the core of the site, but the current wiki index and article route are mock data.

**Recommended work:**

1. Implement article list read path from Firestore or chosen backend.
2. Implement article detail read path by slug/id.
3. Add loading, not-found, and error states.
4. Add real search/filter before forum expansion.
5. Add draft/publish/revision model.
6. Gate editing by role.

**Acceptance criteria:**

- A staff member can reliably find and read real wiki content.
- Admin/editor can create or edit draft content.
- Public/candidate users only see allowed content.

---

### P1 — Editor.js save behavior cleanup

**Task ID:** WIKI-002  
**Files:**

- `src/components/wiki/Editor.tsx`
- `src/app/wiki/edit/page.tsx`

**Problem:**

Editor `onChange` currently saves full editor output on every change and logs it. Upload endpoints are placeholders.

**Recommended work:**

1. Debounce editor saves.
2. Separate local draft state, save draft, and publish.
3. Remove console logging from production path.
4. Implement or remove image upload tools until endpoints exist.
5. Add validation/sanitization of Editor.js output before render.

**Acceptance criteria:**

- Editing does not spam saves.
- Placeholder upload endpoints are not exposed as if working.
- Article render path is safe and predictable.

---

### P2 — Forum should wait until auth/moderation model is real

**Task ID:** FORUM-001  
**Files:**

- `src/app/forum/page.tsx`
- `src/app/forum/topic/[id]/page.tsx`
- `src/app/admin/moderation/page.tsx`

**Recommended work:**

1. Keep forum prototype behind a feature flag until roles/moderation are working.
2. Build data model for public posts, removed posts, locked topics, and flags.
3. Add server actions or API routes with auth checks.
4. Add rate limits and audit log.

**Acceptance criteria:**

- No forum post can be created without an authenticated user and rules check.
- Moderation actions persist and are audited.

---

### P1 — Application form must either persist safely or be marked prototype

**Task ID:** APPLY-001  
**Files:**

- `src/app/apply/page.tsx`
- Add server action/API route if implementing persistence.

**Problem:**

The application form has required fields but no submit handler or persistence. It may look complete to users.

**Recommended work:**

1. Add a visible prototype notice, or
2. Implement submission with validation, confirmation, and admin review queue integration.
3. Be careful with PII. Decide what data the app is allowed to store.
4. Add spam protection if public.

**Acceptance criteria:**

- Users cannot submit into a void.
- Stored data is minimal, intentional, and protected.

---

## 7. Mobile, Visual Design, and Accessibility Backlog

### P1 — Create a real mobile navigation pattern

**Task ID:** UI-001  
**Files:**

- `src/components/layout/Header.tsx`
- `src/components/layout/Header.module.css`

**Problem:**

The mobile menu button is visible on small screens, but it does not open anything. Nav links are hidden in mobile CSS.

**Recommended work:**

1. Add mobile drawer, popover, or bottom nav.
2. Include Wiki, Dashboard/Home, Forum, Apply/Onboarding as appropriate by role.
3. Add keyboard/focus handling.
4. Make auth and dyslexia controls understandable with labels or menu text.

**Acceptance criteria:**

- Mobile users can navigate without knowing hidden URLs.
- Menu open/close is accessible.

---

### P1 — Define a complete design-token system

**Task ID:** UI-002  
**Files:**

- `src/app/globals.css`
- CSS modules under `src/app/**` and `src/components/**`

**Problem:**

Global CSS defines several variables, but components use additional variables such as `--stone-grey`, `--charcoal-lighter`, `--charcoal-dark`, and `--charcoal-darker`. Some uses include fallbacks; others do not. This creates inconsistent theming.

**Recommended work:**

1. Define all shared tokens in `:root`.
2. Use semantic tokens: `--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-text-muted`, `--color-border`, `--color-accent`, `--space-*`, `--radius-*`, `--shadow-*`.
3. Avoid each component inventing new colors.
4. Add a small visual style guide page if helpful.

**Acceptance criteria:**

- No CSS module references undefined variables.
- Mobile/dark/light styling remains consistent.

---

### P1 — Respect reduced motion and improve animation performance

**Task ID:** UI-003  
**Files:**

- `src/components/ui/EmbersBackground.tsx`
- `src/components/layout/Ticker.tsx`
- `src/components/layout/Ticker.module.css`
- `src/components/layout/AlertsHUD.module.css`

**Problem:**

The site uses continuous animation: canvas embers, ticker scroll, HUD pulse/fades. These are flavorful, but should not be forced.

**Recommended work:**

1. Add `prefers-reduced-motion` handling.
2. Disable embers or reduce particle count on mobile/low-power mode.
3. Stop animation when tab is hidden.
4. Avoid per-frame React state changes.
5. Make ticker manually usable without motion.

**Acceptance criteria:**

- Reduced-motion users get a calmer interface.
- Animations do not dominate CPU/battery on phones.

---

### P1 — Mobile AlertsHUD cleanup

**Task ID:** UI-004  
**Files:**

- `src/components/layout/AlertsHUD.tsx`
- `src/components/layout/AlertsHUD.module.css`

**Recommended work:**

1. On mobile, stack weather temp/condition/stats cleanly.
2. Hide or collapse location block unless tapped.
3. Move counter/pause controls into a compact corner.
4. Avoid long detailed forecasts in the sticky header; expose via expand button.
5. Keep emergency/critical messages readable first.

**Acceptance criteria:**

- Header does not consume too much vertical space on mobile.
- Critical alert text remains readable.
- Controls are tap-friendly.

---

### P2 — Normalize inline styles into CSS modules

**Task ID:** UI-005  
**Files:**

- `src/components/admin/TickerSyncButton.tsx`
- Related admin CSS modules

**Problem:**

TickerSyncButton uses inline styles instead of shared tokens/classes.

**Recommended work:**

1. Move styles into a CSS module.
2. Use shared tokens.
3. Match admin panel visual language.

**Acceptance criteria:**

- Admin components follow the same design system.

---

### P2 — Fix dyslexia-mode font behavior

**Task ID:** A11Y-001  
**Files:**

- `src/app/globals.css`
- `src/components/layout/DyslexiaToggle.tsx`

**Problem:**

Global CSS imports OpenDyslexic from a CDN, but dyslexia mode references `Lexie Readable`. The app also already loads Lexend via `next/font`.

**Recommended work:**

1. Decide whether dyslexia mode uses OpenDyslexic, Lexend, Atkinson Hyperlegible, or another font.
2. Avoid render-blocking external CSS import if possible.
3. Update button label/title to match actual font.
4. Add clear persisted user preference.

**Acceptance criteria:**

- The toggle applies the font it says it applies.
- No unnecessary external font import hurts startup.

---

## 8. API, Security, and Reliability Backlog

### P0 — Change mutating API routes to protected POST

**Task ID:** API-001  
**Files:**

- `src/app/api/ticker/sync/route.ts`

**Recommended work:**

1. Use POST for sync/mutations.
2. Require admin or server cron secret.
3. Return sanitized error messages.
4. Log detailed errors server-side only.
5. Add rate limiting or throttle independent of Firestore read success.

**Acceptance criteria:**

- Anonymous GET requests cannot mutate Firestore or call Gemini.

---

### P1 — Parallelize and harden RSS fetching

**Task ID:** API-002  
**Files:**

- `src/app/api/ticker/sync/route.ts`

**Problem:**

RSS feeds are fetched sequentially with no obvious timeout. One slow feed can delay the whole sync.

**Recommended work:**

1. Fetch feeds in parallel with concurrency limit.
2. Add AbortController timeout per feed.
3. Record failed feed IDs and continue gracefully.
4. Sort/dedupe items before summarization.
5. Return sync diagnostics to admin.

**Acceptance criteria:**

- One broken RSS feed does not stall the whole sync.
- Admin can see which feeds failed.

---

### P1 — Add schema validation for AI-generated ticker JSON

**Task ID:** API-003  
**Files:**

- `src/app/api/ticker/sync/route.ts`
- Add `src/lib/tickerSchema.ts`

**Recommended work:**

1. Add Zod or equivalent schema validation.
2. Validate URL, category, title length, source, and generated item count.
3. Repair or drop invalid items.
4. Add tests for malformed Gemini output.

**Acceptance criteria:**

- Invalid model output cannot crash sync or write bad data.

---

### P1 — Improve Firestore update strategy for liveTicker

**Task ID:** API-004  
**Files:**

- `src/app/api/ticker/sync/route.ts`
- `src/components/layout/Ticker.tsx`

**Problem:**

The sync route deletes the full collection and inserts new documents. That can cause flicker, races, and partial states.

**Recommended work:**

1. Write a new sync batch with `syncId`/`createdAt` metadata.
2. Mark current sync atomically via a small metadata document.
3. Have clients read the current sync only.
4. Keep prior sync for fallback until new sync is complete.
5. Clean old syncs asynchronously.

**Acceptance criteria:**

- Clients never see an empty ticker during sync.
- Failed sync does not destroy the last good feed.

---

### P1 — Sanitize server error responses

**Task ID:** API-005  
**Files:**

- `src/app/api/ticker/sync/route.ts`
- `src/app/api/alerts/coronado/route.ts`

**Recommended work:**

1. Do not return `String(err)` for server errors.
2. Return a generic user-facing error plus a request ID.
3. Log full error server-side.
4. Keep operational status messages safe for public display.

**Acceptance criteria:**

- Public API responses do not leak stack traces, credentials, environment details, or internal implementation details.

---

## 9. PWA and Offline Backlog

### P1 — Decide explicit offline strategy by data type

**Task ID:** PWA-001  
**Files:**

- `next.config.ts`
- service worker/PWA config
- wiki data fetch layer
- alert/ticker fetch layer

**Recommended policy:**

- Static shell: cache aggressively.
- Wiki articles: cache for offline reading and expose last updated time.
- Ticker flavor items: cache recent list, safe to show as flavor if stale-labeled.
- Weather/alerts/safety: cache only as stale fallback and visibly label age.
- Admin/application/forum mutations: queue only if deliberately designed; otherwise require online.

**Acceptance criteria:**

- Offline mode helps staff read the handbook.
- Stale safety data is never presented as live truth.

---

### P2 — Improve manifest and install polish

**Task ID:** PWA-002  
**Files:**

- `public/manifest.json`
- `src/app/layout.tsx`
- icons in `public/`

**Recommended work:**

1. Check manifest name, short name, theme color, icons, display mode.
2. Add app screenshots if desired.
3. Confirm iOS safe area behavior.
4. Test install on Android/iOS.

**Acceptance criteria:**

- Installed app looks intentional and not like a default Next app.

---

## 10. Testing Backlog

### P1 — Add typecheck script

**Task ID:** Q-002  
**Files:**

- `package.json`

**Recommended change:**

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

**Acceptance criteria:**

- `npm run typecheck` works locally and in CI.

---

### P1 — Add unit tests for pure logic first

**Task ID:** Q-003  
**Files:**

- `src/lib/tickerUtils.ts`
- Future ticker schema/rotation/filter modules

**Recommended work:**

1. Extract pure ticker logic from API route.
2. Test feed parsing, filtering, title truncation, URL fallback, dedupe, category mixing.
3. Use Vitest or Jest.

**Acceptance criteria:**

- Ticker rules can be changed without manually clicking through the app.

---

### P2 — Add Playwright smoke tests

**Task ID:** Q-004  
**Files:**

- Add Playwright config and tests.

**Suggested smoke paths:**

- `/`
- `/wiki`
- `/wiki/article/1` or real seeded article
- `/apply`
- mobile viewport header/nav
- admin unauthorized route behavior

**Acceptance criteria:**

- CI catches broken routes and mobile nav regressions.

---

## 11. Suggested Multi-Agent Work Split

Use separate agents/branches, but merge in this order to avoid conflicts.

### Agent A — Repo hygiene and CI

**Owns:** REPO-001, Q-001, Q-002  
**Touch:** `.gitignore`, `package.json`, `.github/workflows/ci.yml`, generated PWA files  
**Do first.** Other agents need a build safety net.

### Agent B — Auth, roles, and data model

**Owns:** AUTH-001, DATA-002, API-001  
**Touch:** auth helpers, middleware, Firestore rules/docs, type models  
**Do before real admin/forum/application features.**

### Agent C — Header, ticker, and snappiness

**Owns:** PERF-001, PERF-003, PERF-004, TICKER-001, TICKER-002, TICKER-003  
**Touch:** Header, Ticker, CampFeedPanel, lazy/deferred loading, reduced motion  
**Must coordinate with Agent B** for protected sync/admin state.

### Agent D — Ticker backend and feed quality

**Owns:** TICKER-004, TICKER-005, API-002, API-003, API-004, API-005  
**Touch:** ticker sync route, feed parsing, schema validation, Firestore write strategy  
**Must coordinate with Agent C** for frontend data shape.

### Agent E — Core wiki

**Owns:** WIKI-001, WIKI-002, DATA-001 wiki portions  
**Touch:** wiki pages, editor, article models, draft/publish flow  
**Priority after Agent A/B foundation.**

### Agent F — Mobile visuals and accessibility

**Owns:** UI-001, UI-002, UI-003, UI-004, UI-005, A11Y-001  
**Touch:** CSS modules, global tokens, mobile header, AlertsHUD, design consistency  
**Can start token audit early, but should avoid broad restyle conflicts.**

### Agent G — PWA/offline

**Owns:** PWA-001, PWA-002  
**Touch:** next-pwa config, offline caching, stale labels, manifest/icons  
**Do after data boundaries are clear.**

---

## 12. “Do Not Accidentally Break This” Notes

- The wiki is the core product. Do not let forum/application/admin polish outrun real wiki reading/editing.
- Do not present weather/fire/road/alert data as live when it is cached or stale.
- Do not let ordinary users call Gemini or mutate Firestore.
- Do not store sensitive medical/I-9/tax documents in the app unless the legal/security model is deliberately designed. Status tracking is safer than document storage.
- Do not make the sticky header so tall on mobile that the content feels trapped under dashboard chrome.
- Preserve the rustic Camp Lawton identity, but reduce constant motion and visual clutter.
- Keep the app broad-audience safe. The ticker should add life and flavor, not drama.

---

## 13. Fast Win Checklist

These are small, high-confidence improvements for the first cleanup PRs:

- [ ] Add `typecheck` script.
- [ ] Add CI workflow.
- [ ] Define missing CSS variables in `globals.css`.
- [ ] Make mobile menu button functional or hide it until functional.
- [ ] Remove auto-sync call from `Ticker.tsx`.
- [ ] Change ticker sync to protected POST.
- [ ] Add `prefers-reduced-motion` rules for ticker/HUD/embers.
- [ ] Replace `TickerSyncButton` inline styles with CSS module classes.
- [ ] Add `.env.example`.
- [ ] Mark mock-only pages as prototype/coming soon.

---

## 14. Recommended First Three PRs

### PR 1 — Build safety and repo hygiene

- Add typecheck script.
- Add CI.
- Ignore/remove generated PWA artifacts after verifying build output.
- Add `.env.example`.
- Add missing global CSS tokens.

### PR 2 — Stop unsafe ticker sync behavior

- Remove client auto-sync from `Ticker.tsx`.
- Add read-only live ticker endpoint or Firestore limited query.
- Convert `/api/ticker/sync` to protected POST.
- Keep manual admin sync only.

### PR 3 — Mobile header and Camp Feed UX

- Implement mobile nav.
- Make Camp Feed label a button.
- Add floating feed panel/bottom sheet.
- Make mobile single-entry ticker reveal full text.
- Add reduced-motion handling.

---

## 15. Final Assessment

The app is not a disaster; it is just at the point where continuing to add features without a cleanup pass will make every next change slower. The best move is to stabilize the repo, stop expensive/global side effects, make the wiki real, and then polish mobile and PWA behavior.

The biggest product call: treat the site as a **wiki-first staff hub**. The command-center flavor is good, but the app should feel instant and trustworthy before it feels flashy.
