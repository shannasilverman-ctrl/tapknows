# Codebase map — TAP

*Bounded map from a deterministic preflight. Every line traces to what is on disk at
`/Users/shannasilverman/Documents/Codex/2026-07-25/usin/tap`. Not a full repo inventory.*

## Runtime and package facts

- `package.json` name `tap`, `"type": "module"`, private.
- Node v22.23.1, npm 10.9.8 (observed on this machine).
- Framework: TanStack Start / React Router (`@tanstack/react-start`, `@tanstack/react-router`),
  React 19, Vite 7-era toolchain, Tailwind v4 (`@tailwindcss/vite`), shadcn-style UI in
  `src/components/ui/` (`components.json` present).
- Backend: Supabase (`@supabase/supabase-js`), Plaid (`react-plaid-link`), `jose`, `zod`.
- Deploy target: Cloudflare Workers via `nitro` + wrangler. Build emits `.output/`
  (`.output/server/index.mjs`, `.output/public`), **not** `dist/`.
- Env: `.env` and `.env.example` at root; `.lovable/` marks Lovable origin.

## Entry points

- `src/server.ts` — worker entry (`main` in `wrangler.jsonc`).
- `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts` — app bootstrap and generated route
  tree (generated; do not hand-edit).
- `src/routes/__root.tsx` — root layout.
- Routes (file-based, `src/routes/`): `index`, `home`, `decide`, `pay`, `purchases`, `cards`,
  `plan`, `offers`, `bonuses`, `alerts`, `settings`, `onboarding`, `login`, `demo`, `admin`,
  `privacy`, `terms`, plus `api/public/plaid/webhook.ts`.

## Commands

- Gate: `npm run check` = `format:check` (prettier) → `lint` (eslint) → `typecheck` (`tsc
  --noEmit`) → `test` (`vitest run`) → `build` (`vite build`).
- Unit tests: `npm test` — vitest, `environment: "node"`, include
  `src/**/*.test.ts(x)`, alias `@` → `./src` (`vitest.config.ts`).
- E2E: `npm run test:e2e` — Playwright, `testDir: ./e2e`, single project `mobile-chrome`
  (Pixel 7 device), `baseURL` = `TAP_BASE_URL` or `http://127.0.0.1:8080`, viewport 390x900,
  `fullyParallel: false`, `retries: 0`, 30s timeout.
- E2E prerequisite (operator-stated, matches configs on disk): `npm run build`, then
  `npx wrangler dev --config wrangler.preview.jsonc --port 8080 --ip 127.0.0.1 --local`, then
  Playwright. `vite preview` does not serve this build.

## Deployment boundary

- `wrangler.jsonc` — worker `tap-independent-preview`, `main: src/server.ts`, routes bound as
  **custom domains** `tapknows.com` and `www.tapknows.com`. **No staging route on disk.**
- `wrangler.preview.jsonc` — worker `tap-preview`, `main: .output/server/index.mjs`,
  `no_bundle: true`, ASSETS bound to `.output/public`. This is the local-serving config.
- Both use `compatibility_date: 2025-09-24`, flag `nodejs_compat`, `run_worker_first: true`.

## Major boundaries

- **Pure domain logic** — `src/lib/*.ts` (59 files). Single shared recommendation engine at
  `src/lib/recommendationEngine.ts`; Purchases/Decide agreement is locked by
  `src/lib/engineParity.test.ts`. Supporting: `planner.ts`, `benefits.ts`, `benefitCoverage.ts`,
  `cardCatalog.ts`, `merchantMap.ts`, `pointValuations.ts`, `walletRoles.ts`,
  `utilizationFilter.ts`, `feeMemory.ts`, `nearby.ts`, `quickPicks.ts`.
- **Server functions** — `*.functions.ts` files created with `createServerFn` from
  `@tanstack/react-start`: `analytics.functions.ts`, `alerts.functions.ts`,
  `benefits.functions.ts`, `nearby.functions.ts`, `plaid.functions.ts`, `push.functions.ts`,
  `screenshotImport.functions.ts`. Auth is applied as middleware `requireSupabaseAuth` from
  `src/integrations/supabase/auth-middleware.ts`.
- **Supabase integration** — `src/integrations/supabase/{client.ts, client.server.ts,
  auth-middleware.ts, auth-attacher.ts, types.ts}`.
- **Schema** — `supabase/migrations/` (21 SQL files, `20260520…`–`20260717…`). Existing tables
  include `profiles`, `user_cards`, `user_offers`, `user_purchases`, `user_points_balances`,
  `user_cpp_overrides`, `user_signup_bonuses`, `cards_catalog`, `merchants_catalog`,
  `points_programs`, and — in `20260717033221_…sql` — `user_sessions`, `user_daily_active`,
  `alert_events`, each with `ENABLE ROW LEVEL SECURITY`.
- **Hooks** — `src/hooks/`: `use-auth.tsx`, `use-session-tracking.ts` (mounted once at root;
  calls `startSession`, pings every 60s, silently swallows failures, gated on a signed-in
  `user`), `use-online.ts` (`navigator.onLine`, defers reading until after first render to
  avoid hydration drift), `use-guest-migration.ts`, `use-mobile.tsx`.
- **Guest path** — `src/lib/guestWallet.ts`: typed `localStorage` wrapper under key
  `card_savvy_guest_wallet_v1`, mirrored into the account on sign-in via a
  `migrate_guest_wallet` RPC. Guest usage is a real, supported path.
- **UI** — `src/components/` (project components) and `src/components/ui/` (shadcn primitives).
  `src/components/tap-primitives.tsx` and `DESIGN.md` carry the design vocabulary.

## Integration seams for the stated work

### Journey instrumentation

- `src/lib/journeyEvents.ts` — the single naming point. Exports `DECISION_FUNNEL_EVENTS`,
  `LEARNING_LOOP_EVENTS`, `JOURNEY_EVENTS`, `isJourneyEvent`, `trackJourneyEvent`,
  `readJourneyEvents`, `hasJourneyEvent`, `resetJourneyEvents`, and `JOURNEY_SINK_KEY`.
  Sink is a module-level array, also hung off `window.__tapJourneyEvents`; `bindWindowSink()`
  adopts a pre-existing array so a test's own reference keeps receiving records. Unknown names
  are rejected with a `console.warn` and return `false`.
- Emitters on disk: `src/routes/home.tsx:529` (`wallet_ready`), `:533` and `:541`
  (`merchant_selected`); `src/routes/decide.tsx:251` (`recommendation_viewed`), `:506`
  (`payment_choice_recorded`); `src/components/wallet-card-briefing.tsx:111`
  (`card_guide_opened`), `:318` (`benefit_detail_opened`).
- **No emitter exists for `proof_opened`, `wallet_opened`, or `situation_tried`** — they are
  named in `journeyEvents.ts` but ungrepped anywhere else in `src/`.
- Sink contract under test: `src/lib/journeyEvents.test.ts` (unit) and
  `e2e/product-system.spec.ts:283-304` — the e2e test polls
  `window.__tapJourneyEvents` for `wallet_ready` (on `/home`), `recommendation_viewed`
  (on `/decide?merchant=whole_foods&category=groceries&amount=84`), and `card_guide_opened`
  (on `/cards?card=guest_chase`). Any persistence work must leave this array reachable and
  populated.
- Persistence precedent to pattern-match: `src/lib/analytics.functions.ts` — `startSession`
  (upserts `user_daily_active`, inserts `user_sessions`, conditionally inserts `alert_events`),
  `pingSession`, `getAdminStats` (admin-gated via `has_role` RPC; aggregates WAU, a 14–21-day
  cohort return rate, and alert engagement). **All three are wrapped in `requireSupabaseAuth`**
  — there is no unauthenticated analytics ingress on disk today, which is the seam a
  guest/signed-out journey event has to cross.

### Rate staleness

- `src/lib/cardCatalog.ts:22` — `export const RATES_VERIFIED_ON = "2026-07-12";` with a header
  comment at `:3` reading "Do not edit rates without re-verifying." Every one of the 14 catalog
  entries sets `rates_verified_on: RATES_VERIFIED_ON`.
- `src/lib/cardCatalog.test.ts:37` asserts each entry's `rates_verified_on` equals the
  constant — an existing consistency check, but **no freshness check**.
- Customer-facing today: `src/components/see-the-math.tsx:5` imports `RATES_VERIFIED_ON` and
  passes it at `:66` as `termsDate` to `RecommendationProof`
  (`src/components/recommendation-proof.tsx`). This is the existing surface where a staleness
  consequence would be visible.
- `src/lib/benefits.ts` — 60 `verified_on` occurrences; 40 dated `2026-07-18` and 18 dated
  `2026-07-26` in the literal form `verified_on: "…"`. Covered by `src/lib/benefits.test.ts`
  and `src/lib/benefitCoverage.test.ts`.
- No `scripts/` directory and no freshness/date-check step exists in `package.json`; a new gate
  check has to be threaded into the `check` script chain.

## Risky hotspots

- **Live-domain binding.** `wrangler.jsonc` points at the `tapknows.com` custom domain with no
  staging route on disk. A deploy is a production deploy.
- **45 brittle PNG snapshots.** `e2e/consumer-visual.spec.ts-snapshots/` holds 45
  `*-mobile-chrome-darwin.png` files across 15 screens × {mobile, tablet, desktop}. Any pixel
  change to a customer-facing surface — including a staleness banner — trips them.
- **Engine parity.** `src/lib/engineParity.test.ts` locks Purchases and Decide to the same
  `recommendationEngine.ts`. Touching the engine breaks the proof.
- **Generated route tree.** `src/routeTree.gen.ts` is generated by `@tanstack/router-plugin`.
- **Time-dependent gate.** A staleness check compares a hard-coded date to "now", so the gate's
  result changes with the calendar even when no code changes — `vitest` runs inside
  `npm run check`, so a naive implementation makes the whole gate spontaneously red.
- **Auth-only analytics ingress.** Every existing `*.functions.ts` analytics entry point is
  behind `requireSupabaseAuth`; guest-path persistence has no precedent to copy.
- **Silent-failure convention.** `use-session-tracking.ts` swallows errors (`catch {}` / `//
  silent`) to keep the surfaces unblocked — the same non-blocking discipline the journey
  persistence is required to honour.

## Working-tree state at preflight

- Git repo, branch tip `dc60276` ("Lock the new product behaviour with e2e coverage"), 8
  commits since baseline `00323d7`.
- Only untracked path: `.kiln-archive-takeover-2026-07-26/`. No modified tracked files.
- Prior review artifacts on disk: `docs/review/2026-07-26-takeover-review.md`,
  `docs/customer-experience/tap-customer-experience-report.html`.
