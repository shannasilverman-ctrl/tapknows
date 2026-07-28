# Project brief — TAP: journey instrumentation + rate-staleness tripwire

*Compiled from the operator's idea, verbatim input only. Brownfield target: existing repo,
existing tests, live production deployment at https://tapknows.com.*

## Purpose

Close two gaps the customer-experience report left open in TAP:

1. **Ship the journey instrumentation.** The canonical journey events are already named and
   already emitted, but they die in the browser tab — nothing reaches a server, so the
   decision funnel is still unanswerable. Persist journey events durably so drop-off between
   funnel steps can actually be read back.
2. **Give rate staleness a tripwire.** `RATES_VERIFIED_ON` is a hand-maintained constant that
   nothing on disk fails against. The product promise is "we know the right card for this
   purchase"; silently serving stale earn rates is the most damaging quiet failure this app
   has. Make staleness impossible to ship unnoticed.

## Users

- **Customers of TAP** — including guests: guest usage is stated as a first-class path in this
  app. They are the ones who would be silently served aging earn rates, and the ones whose
  decision surfaces must not be slowed or blocked by instrumentation.
- **The operator / product owner** — the party who needs the funnel to become answerable, and
  who maintains the verified-on dates by hand today.

## Deliverable

### 1. Durable journey-event persistence

- Journey events reach a server and are stored so that **drop-off between funnel steps can be
  read back**.
- Events **survive being sent while offline or signed out** (guest usage is first-class).
- Persistence **must not block or slow the decision surfaces**.
- The existing **observable-sink behaviour must never be lost** — the e2e tests depend on it.

Named existing surfaces the idea points at:
- `src/lib/journeyEvents.ts` — names the decision-funnel events (`wallet_ready`,
  `merchant_selected`, `recommendation_viewed`, `proof_opened`, `payment_choice_recorded`) and
  the learning-loop events (`wallet_opened`, `situation_tried`, `card_guide_opened`,
  `benefit_detail_opened`); `trackJourneyEvent` records to an in-memory sink readable from
  `window`.
- Emitting surfaces: `src/routes/home.tsx` (`wallet_ready`, `merchant_selected`),
  `src/routes/decide.tsx` (`recommendation_viewed`, `payment_choice_recorded`),
  `src/components/wallet-card-briefing.tsx` (`card_guide_opened`, `benefit_detail_opened`).
- Existing RPC surface: `src/lib/analytics.functions.ts` (carries `startSession`,
  `pingSession`, `getAdminStats` against Supabase).
- Schema home: `supabase/migrations/`; tables `user_sessions` and `user_daily_active` already
  exist.

### 2. Rate-staleness tripwire

- A check that **fails the repository gate (`npm run check`)** once the verified date is older
  than a defined freshness window.
- An **honest customer-facing consequence** for rates that are aging.
- `src/lib/benefits.ts` per-row `verified_on` dates (most 2026-07-17/18, with a 2026-07-26
  pass) **deserve the same treatment**.

Named existing surface: `src/lib/cardCatalog.ts` exports `RATES_VERIFIED_ON = "2026-07-12"` as
a hand-maintained constant.

## Constraints (operator-stated)

- The repository gate is `npm run check` (format:check, lint, typecheck, vitest, build) and
  **must stay green**.
- The e2e suite is Playwright; `e2e/product-system.spec.ts` is the behavioural suite and
  **must stay green**. Running it requires: `npm run build`, then
  `npx wrangler dev --config wrangler.preview.jsonc --port 8080 --ip 127.0.0.1 --local`, then
  Playwright against `http://127.0.0.1:8080`. Plain `vite preview` does **not** work — it
  expects `dist/server/server.js`; the Cloudflare build emits `.output/`.
- `e2e/consumer-visual.spec.ts` holds **45 darwin/mobile-chrome PNG snapshots** that are
  brittle to any UI change.
- Do **not** break the single shared recommendation engine (`src/lib/recommendationEngine.ts`)
  — Purchases and Decide are proven to agree by `src/lib/engineParity.test.ts`.
- `wrangler.jsonc` binds directly to the **live tapknows.com custom domain; there is no
  staging route**.

## Non-goals

- Anything not named by the two improvements above. The idea scopes exactly two pieces of work
  and closes no other report gaps.
- Changing the recommendation engine's behaviour or its Purchases/Decide parity.
- Re-running or re-baselining the 45 visual snapshots as an end in itself; they are named as a
  brittleness hazard, not as work to do.
- Introducing a staging route or altering the production binding.

## Visual-artifact presence

**Yes — partially.** The second improvement requires "an honest customer-facing consequence for
rates that are aging," which puts pixels on a screen the operator will look at. The first
improvement is explicitly required *not* to change how the decision surfaces behave for the
customer (must not block or slow them), so it is expected to be invisible. Any pixel change is
in tension with the 45 brittle PNG snapshots, which the operator names as a constraint.

## Unresolved assumptions

Named as open, not guessed:

1. **Freshness window length is undefined.** The idea says the gate fails "once the verified
   date is older than a defined freshness window" but does not define it (days? weeks?).
2. **The customer-facing consequence is unspecified.** "Honest" is stated; the actual surface,
   wording, and threshold behaviour are not.
3. **The persistence target is unnamed.** No journey-events table is named. `user_sessions` and
   `user_daily_active` are cited as existing, but whether journey events extend them or get a
   new table/migration is left open.
4. **Guest/signed-out identity is unresolved.** Events must survive being sent while signed
   out, but the idea does not say what identity or key a guest event carries, nor how (or
   whether) it later reconciles with an account.
5. **Retention and privacy of event props are unstated.** Event payloads (merchant, category,
   amount) are not addressed for retention or PII handling.
6. **Whether `benefits.ts` shares the catalog's freshness window.** "The same treatment" is
   stated; whether the window value, the failure mode, and the customer consequence are
   identical or per-row-tuned is open.
7. **Where drop-off is read back.** The idea requires drop-off to be readable; it does not say
   by whom or through what surface (an admin view, a query, an extension of `getAdminStats`).
8. **Three named events have no emitter on disk** — `proof_opened`, `wallet_opened`,
   `situation_tried` appear in `journeyEvents.ts` but no surface emits them (observed in the
   preflight). The idea does not say whether shipping the instrumentation includes emitting
   them.
9. **How the tripwire's clock is fixed.** A date-versus-today check is time-dependent; whether
   the gate must be deterministic under CI/test time is not addressed.
