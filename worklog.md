# MarketLog — Worklog

---
Task ID: 1
Agent: Super Z (main agent)
Task: Build MarketLog — local-first, mobile-first PWA for craft/market vendors (Vite + React + TS SPA, Dexie/IndexedDB primary, Supabase synced copy, per user spec).

Work Log:
- Ran fullstack env init; adapted the default Next.js scaffold into the user-mandated Vite + React SPA (package.json rewritten, bun install OK; gateway still expects port 3000).
- Foundation: index.html, vite.config.ts (react + tailwindcss + vite-plugin-pwa w/ runtimeCaching: CacheFirst shell images, NetworkFirst API), tsconfigs, theme CSS (market green/amber, light+dark), React Router layout w/ bottom nav + center Sell button.
- Local DB layer: src/types (snake_case fields = Postgres columns; integer cents), Dexie schema (8 entity tables + sync_queue, compound indexes), generic local-first repository path (write + enqueue in ONE transaction; soft deletes only), repositories for products/events/eventInventory/sales/expenses/adjustments/profiles.
- Derived inventory model: pure fold (home adjustments − active-event committed / completed-event sold−adj), event remaining = brought + adj − sold; idempotent recompute; snapshot rules for eventInventory + saleItems.
- Calculations as pure functions (profit, margin w/ divide-by-zero guard, sell-through, best sellers, payment mix, hourly buckets, month summary).
- Sync engine: priority push (profile→products→events→inventory→adjustments→sales→saleItems→expenses), real reachability probe (Supabase auth /health, 5s timeout) instead of trusting navigator.onLine, exponential backoff (cap 60s), pull with LWW merge for simple tables + append-only keep-local for sales/movements, session-stale state distinct from network errors, queue dedupe per entity, mid-flight-edit protection (version guard). Conflict resolution as pure tested functions.
- 50 vitest tests (pure calc, fold, merge, plus fake-indexeddb integration of the full write path) — all passing.
- UI: Dashboard, Events (+form), Event Detail (Overview/Sales/Inventory/Expenses/Analytics tabs), Quick Sale (grid → cart sheet → payment → Complete), Products (+form +detail w/ activity ledger + stock adjustments), Settings (profile, sync diagnostics + retry, dark mode, install), Login (real auth when configured, local device mode otherwise). Copy is plain-language per spec ("Saved on this device", "Your session needs refreshing to sync — your data is safe").
- PWA: manifest.webmanifest (standalone, shortcuts), sharp-generated icon set (192/512/maskable/apple-touch), beforeinstallprompt capture + custom install button, iOS Safari Add-to-Home-Screen instructional dialog, SW precache verified in build (15 entries).
- supabase/migrations/0001_init.sql: all tables, RLS on everything (auth.uid() = user_id), indexes on user_id/event_id/product_id/sale_id/updated_at, updated_at triggers, no SECURITY DEFINER.
- agent-browser E2E (mobile viewport): created products (candle $12/5, soap $6.50/6), event (booth $45), prepped inventory (3+4), recorded 2 sales ($43.50 card + $12 cash), added $18.25 expense, verified Overview math ($55.50 rev, $63.25 costs, −$27.25 profit, −49% margin), analytics (hourly chart, payment mix, sell-through 3/3 + 3/4), marked completed → leftover stock returned (soap 2→3), reopened event. No console errors.
- Fixed: Events list header title, ExpenseDialog hydration, ProductRow props, unused imports, syncQueue create-then-delete op semantics (delete wins).

Stage Summary:
- All local CRUD works with zero network (app runs in local device mode when env vars absent).
- Deliverables: full Vite SPA at /home/z/my-project, migration SQL, tests (50 passing), dev server on port 3000.
- Next: final production build → serve dist (real SW precache) → offline cold-start acceptance test → leave server running for preview.

---
Task ID: 2
Agent: Super Z (main agent)
Task: PWA offline verification + acceptance test + final delivery

Work Log:
- Diagnosed SW mystery: workbox `precacheAndRoute` threw `conflicting-entries` (includeAssets + globPatterns duplicated manifest/icons with different revisions) → SW activated but registered no handlers. Fixed by removing includeAssets; moved manifest fully into VitePwa config (plugin was overwriting dist/manifest with a default); renamed SW to ml-sw.js to avoid dev-era HTTP-cache zombie.
- Production build re-verified: 16 precache entries (11 unique), skipWaiting/clientsClaim confirmed.
- CRITICAL ACCEPTANCE TEST (agent-browser, offline emulation on production build):
  1. set offline ✓ 2. open app → served by SW ✓ 3. created Harvest Fair event ✓ 4. added inventory (4 Honey Jars) ✓ 5. recorded 2 sales ($18 card + $18 cash) ✓ 6. added $12 parking expense ✓ 7. "closed" app ✓ 8. reopened offline ✓ 9. all data persisted — Revenue $36, Profit −$49 (36 − 13 COGS − 72 costs) exact ✓ 10. restored internet, app stable ✓.
- Verified sync outbox in raw IndexedDB: 9 pending ops queued in dependency order (profile → product → event → eventInventory → adjustment → sales → saleItems).
- Verified PWA installability: beforeinstallprompt captured → custom "Install MarketLog" banner visible in Chromium; iOS instructions dialog implemented; manifest standalone + 4 icons + shortcuts; apple-touch-icon/theme-color meta present.
- Dark mode toggle verified; screenshots saved to download/ (dashboard, quick sale, event detail, settings-dark).
- Final: 50/50 vitest tests, tsc clean, `vite preview` (dist, pid 5689) serving port 3000 via gateway.

Stage Summary:
- ACCEPTANCE TEST PASSED offline end-to-end on the production PWA.
- Sync to a real Supabase requires project credentials (env vars); code, queue, backoff, conflict resolution, session UX, RLS migrations all in place and unit-tested. App ships in local device mode until configured.
