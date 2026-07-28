# LAW — TAP: journey instrumentation + rate-staleness tripwire

Executable acceptance criteria only. Every criterion runs from the project root via
`bash .kiln/law/check.sh` — exit 0 iff all green; on any red it prints the owning slice
ids of every failed criterion as a JSON array of strings on stdout. Protected by
construction: the observable-sink contract (`window.__tapJourneyEvents`), the shared
recommendation engine (baseline-hashed AND parity-proven), the 45 visual snapshots — the
customer-visible consequence is byte-identical to today's surface while rates are fresh —
and the stylesheet itself (`src/styles.css` byte-pinned at law time, sha256
`2e72056271ae5914ea8b0cc7ba0a53db24f435d800c4e18376c1d2df6e7402c5`), so stale-state
styling can only ride the class vocabulary that already exists. Law-time baselines pinned
in `.kiln/law/migrations-baseline.sha256` (the 20 pre-existing migration files) and
`.kiln/law/engine-baseline.sha256` (`src/lib/recommendationEngine.ts`).

**Stale-notice class allowlist (pinned, per the operator ruling on AT-P2-001 /
AT-P4-001):** the rendered stale notice's element, and every element inside its subtree,
may carry only CSS classes drawn from the explicit allowlist
`["text-muted-foreground"]` — a class that already exists in `src/styles.css` at law time
(selector `.text-muted-foreground`, present in the pinned stylesheet bytes). An element
carrying no class attribute satisfies the condition trivially. Tests prove the allowlist
positively on rendered markup, never by absence-greps alone.

## Criteria

### GT-1
- **Owning slice:** `journey-persist`
- **Requirement:** The repository gate the operator named stays green through every slice
  — format, lint, typecheck, unit tests, and build all pass. Once the staleness gate file
  lands (RF-2), this same command carries the tripwire's teeth: its green is a live claim
  that rates are fresh.
- **Command:** `npm run check`
- **Expected:** exit 0.

### JP-1
- **Owning slice:** `journey-persist`
- **Requirement:** A new additive Supabase migration creates `public.journey_events` with
  exactly this row contract: `id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY`;
  `client_id TEXT NOT NULL`; `name TEXT NOT NULL` plus a `CHECK` constraint restricting
  `name` to the nine canonical journey event names (the JP-3 list); `props JSONB NOT NULL
  DEFAULT '{}'`; `at TIMESTAMPTZ NOT NULL` (client-reported emit time); `created_at
  TIMESTAMPTZ NOT NULL DEFAULT now()`. Row-level security is enabled; `INSERT` is granted
  to `anon` and `authenticated` under one insert policy whose `WITH CHECK` requires
  `client_id IS NOT NULL`; `SELECT` is policy-gated to admins only via
  `public.has_role(auth.uid(), 'admin')` — the repo's own `feedback`-migration precedent.
  No existing table, policy, or migration is modified: the executable migration test
  `src/lib/journeyMigration.test.ts` locates the migration SQL and asserts every element
  above (table + each column with type/nullability/default, RLS enable statement, the
  insert policy's role list and `WITH CHECK` expression, the admin select policy) and
  asserts the file contains no `ALTER`, `DROP`, or policy statement targeting any other
  table; the pinned law-time manifest proves the 20 prior migrations are byte-unchanged.
- **Command:** `shasum -a 256 -c .kiln/law/migrations-baseline.sha256 && npx vitest run src/lib/journeyMigration.test.ts`
- **Expected:** exit 0 — prior migrations byte-identical to the law-time manifest; the new migration's schema, RLS, and policy semantics all asserted green by the executable test.

### JP-2
- **Owning slice:** `journey-persist`
- **Requirement:** A guest-capable server ingress exists: `src/lib/journey.functions.ts`
  defines a `createServerFn` POST handler that delegates to an exported, directly testable
  ingest core, and the file carries no auth middleware at all (`requireSupabaseAuth`
  absent — admin readback lives elsewhere; guests write, admins read). The handler test
  `src/lib/journey.functions.test.ts` drives the exported core with a fake Supabase client
  and NO authentication and proves: a valid batch inserts exactly its validated rows into
  `journey_events`; every record passes `journeyIngest` validation BEFORE any insert call
  (call order observed on the fake); invalid records are never inserted, and a batch of
  only invalid records produces zero insert calls.
- **Command:** `npx vitest run src/lib/journey.functions.test.ts && ! grep -q "requireSupabaseAuth" src/lib/journey.functions.ts`
- **Expected:** exit 0 — unauthenticated valid input inserts validated rows only, validation precedes all inserts, invalid input inserts nothing, and no auth middleware exists in the file.

### JP-3
- **Owning slice:** `journey-persist`
- **Requirement:** The pure validator `src/lib/journeyIngest.ts` admits only the nine
  canonical journey event names — the complete contents of the existing `JOURNEY_EVENTS`
  export in `src/lib/journeyEvents.ts`: the five decision-funnel names `wallet_ready`,
  `merchant_selected`, `recommendation_viewed`, `proof_opened`,
  `payment_choice_recorded`, and the four learning-loop names `wallet_opened`,
  `situation_tried`, `card_guide_opened`, `benefit_detail_opened` — allowlists props to
  `merchant` and `category` slugs only, and strips everything else: amounts are never
  persisted. Unknown names are rejected, never normalized into data.
- **Command:** `npx vitest run src/lib/journeyIngest.test.ts`
- **Expected:** exit 0 — nine-name admission, prop allowlisting, amount stripping, and unknown-name rejection all asserted green.

### JP-4
- **Owning slice:** `journey-persist`
- **Requirement:** A durable client queue (`src/lib/journeyQueue.ts`, storage injectable,
  defaulting to `localStorage` under a versioned key with a persistent random guest
  `client_id`) holds events sent while offline or signed out: enqueued events survive
  module re-initialization (reload), flush to the server function when connectivity
  returns, and never enqueue an unknown event name. Flushing is fire-and-forget: every
  flush failure is swallowed silently and events stay queued — enqueue and flush never
  throw and never block a caller.
- **Command:** `npx vitest run src/lib/journeyQueue.test.ts`
- **Expected:** exit 0 — persistence-across-reinit, flush-on-reconnect, unknown-name rejection, and silent-failure behavior all asserted green.

### JP-5
- **Owning slice:** `journey-persist`
- **Requirement:** Persistence hangs BEHIND the existing observable sink:
  `trackJourneyEvent` writes the in-memory sink synchronously first, then hands the record
  to the queue; the `__tapJourneyEvents` window key and the whole existing sink API are
  unchanged (pre-placed test array adopted, reset empties it, unknown names rejected), and
  no network call happens on the emit path itself.
- **Command:** `npx vitest run src/lib/journeyEvents.test.ts && grep -q "__tapJourneyEvents" src/lib/journeyEvents.ts && grep -q "journeyQueue" src/lib/journeyEvents.ts`
- **Expected:** exit 0 — sink tests green, sink key intact, queue wired downstream of the sink.

### JP-6
- **Owning slice:** `journey-persist`
- **Requirement:** The single shared recommendation engine is untouched, proven both ways:
  `src/lib/recommendationEngine.ts` stays byte-identical to its law-time baseline hash,
  and behavioral parity holds — Purchases and Decide still agree on pinned fixtures.
- **Command:** `shasum -a 256 -c .kiln/law/engine-baseline.sha256 && npx vitest run src/lib/engineParity.test.ts`
- **Expected:** exit 0 — engine source unmodified and engine parity proof green.

### JR-1
- **Owning slice:** `journey-readback`
- **Requirement:** Funnel arithmetic is unit-proven with pinned semantics: a pure function
  in `src/lib/journeyFunnel.ts` takes plain event rows (`client_id`, `name`; extra fields
  ignored) and computes the five decision-funnel steps in canonical order
  (`wallet_ready` → `merchant_selected` → `recommendation_viewed` → `proof_opened` →
  `payment_choice_recorded`). The counting unit is DISTINCT `client_id` per step — a
  client counts once per step no matter how many times it repeats an event; rows with
  non-funnel names are ignored; no temporal ordering between steps is required. Output is
  an array of exactly five `{ step, count, dropOff }` objects in funnel order, where
  `dropOff` is `null` for the first step and whenever the previous step's count is `0`,
  and otherwise `max(0, 1 - count / prevCount)` as a fraction. Pinned fixtures cover
  repeated events, multiple clients, ignored non-funnel rows, and a zero-count middle
  step.
- **Command:** `npx vitest run src/lib/journeyFunnel.test.ts`
- **Expected:** exit 0 — per-step distinct-client counts and adjacent-step drop-off, including the zero-denominator case, computed exactly as pinned.

### JR-2
- **Owning slice:** `journey-readback`
- **Requirement:** Drop-off is readable back by the operator, admin-gated exactly like
  `getAdminStats`: `src/lib/analytics.functions.ts` exports `getJourneyFunnel` — a
  `createServerFn` carrying `.middleware([requireSupabaseAuth])` plus the
  `has_role(…, 'admin')` check (403 otherwise) — whose handler reads `journey_events`
  through an exported query core feeding JR-1's funnel function. The test
  `src/lib/analyticsJourney.test.ts` proves both halves: a structural assertion on the
  `getJourneyFunnel` declaration chain (auth middleware and admin check present), and a
  fake-Supabase-client run showing the exported core issues the `journey_events` read and
  returns JR-1's five-step shape.
- **Command:** `npx vitest run src/lib/analyticsJourney.test.ts`
- **Expected:** exit 0 — admin gating asserted on the declaration, and the `journey_events` read demonstrated through the exported core.

### RF-1
- **Owning slice:** `rate-freshness-gate`
- **Requirement:** A deterministic freshness core exists: `src/lib/rateFreshness.ts`
  exports `RATE_FRESHNESS_WINDOW_DAYS = 90` and a pure staleness predicate taking an
  injected "today"; pinned-clock tests prove both sides of the boundary deterministically
  — fresh at exactly 90 days, stale at 91.
- **Command:** `npx vitest run src/lib/rateFreshness.test.ts`
- **Expected:** exit 0 — the predicate is pure and both boundary sides are asserted.

### RF-2
- **Owning slice:** `rate-freshness-gate`
- **Requirement:** The tripwire actually trips the repository gate: a vitest gate file
  (`src/lib/rateFreshness.gate.test.ts`, which runs inside `npm test` and therefore inside
  `npm run check`) validates `RATES_VERIFIED_ON` and every `verified_on` row in
  `src/lib/benefits.ts` against the current date, pinnable via `TAP_TODAY` for CI
  determinism. Under a far-future clock the gate MUST go red.
- **Command:** `[ -f src/lib/rateFreshness.gate.test.ts ] && ! TAP_TODAY=2099-01-01 npx vitest run src/lib/rateFreshness.gate.test.ts`
- **Expected:** exit 0 — the gate file exists and FAILS under `TAP_TODAY=2099-01-01`; staleness cannot ship unnoticed.

### RF-3
- **Owning slice:** `rate-freshness-gate`
- **Requirement:** The gate is honest in both directions: with today's real clock and the
  currently verified dates the same gate file passes, and it demonstrably covers the
  `benefits.ts` rows — the "same treatment" the brief requires, one shared window
  constant, not scattered.
- **Command:** `grep -q "benefits" src/lib/rateFreshness.gate.test.ts && npx vitest run src/lib/rateFreshness.gate.test.ts`
- **Expected:** exit 0 — benefits rows are covered and the gate is green while rates are fresh.

### SC-1
- **Owning slice:** `staleness-consequence`
- **Requirement:** The customer-facing consequence is honest and snapshot-safe:
  `src/lib/rateAge.ts` exports `describeRateAge(verifiedOn, today)` where the fresh path
  returns EXACTLY the `verifiedOn` string (byte-identical to what the proof surface
  renders today, so the 45 visual snapshots hold), and the stale path returns a
  plain-language notice naming the verified date and stating the rates are older than
  `RATE_FRESHNESS_WINDOW_DAYS` days. Pinned clocks on both paths.
- **Command:** `npx vitest run src/lib/rateAge.test.ts`
- **Expected:** exit 0 — fresh output identical to the raw date; stale output names the date and the age.

### SC-2
- **Owning slice:** `staleness-consequence`
- **Requirement:** The consequence is wired into the existing customer surface: the
  "Rates verified" `<dd>` in `src/components/recommendation-proof.tsx` renders
  `describeRateAge(termsDate, today)` output — the raw-constant rendering path is gone —
  where `today` is an injectable optional prop defaulting to the current date. The
  component test `src/components/recommendation-proof.test.tsx` renders the real component
  via `react-dom/server`'s `renderToStaticMarkup` under pinned inputs and proves both
  paths: a fresh pinned pair renders the disclosure date byte-identical to the raw
  `termsDate` string with no staleness copy anywhere in the markup; a stale pinned pair
  renders the `describeRateAge` notice in that same `<dd>` while the bare-date-only
  rendering is absent.
- **Command:** `npx vitest run src/components/recommendation-proof.test.tsx`
- **Expected:** exit 0 — describeRateAge output rendered in the existing disclosure on both pinned paths; raw-constant path absent.

## Plan

| slice | milestone |
| --- | --- |
| journey-persist | journey-instrumentation |
| journey-readback | journey-instrumentation |
| rate-freshness-gate | rate-staleness |
| staleness-consequence | rate-staleness |

## Perceptual

| criterion id | owning slice | dim | requirement | proxy command | expected | reference |
| --- | --- | --- | --- | --- | --- | --- |
| P-1 | staleness-consequence | fidelity-to-requirement | Rendered with a pinned stale date, a visible honest notice appears in the recommendation-proof disclosure the customer already opens — `src/components/proof-stale-notice.test.tsx` renders the real component and asserts the notice on the rendered markup, not on identifier presence | `npx vitest run src/components/proof-stale-notice.test.tsx` | exit 0 | |
| P-2 | staleness-consequence | typography | The rendered stale notice rides the proof sheet's existing type scale, proven positively on rendered markup: `src/components/proof-stale-sentence.test.tsx` renders the real component via `renderToStaticMarkup` under a pinned stale pair and asserts ALL of — (a) the notice is one complete authored sentence with terminal punctuation naming the pinned verified date and the 90-day window; (b) the notice element sits inside the "Rates verified" `<dd>` of the `tap-proof-disclosure` list, and the test reads `src/styles.css` at run time and asserts the selector `.tap-proof-disclosure dd` exists — the pre-existing rule that defines that type scale; (c) the notice element and every element in its subtree carry only classes from the pinned allowlist `["text-muted-foreground"]` (no class attribute passes trivially), and each allowlist entry occurs as a `.`-prefixed class selector in `src/styles.css`; (d) no `style` attribute appears anywhere in the notice subtree. Sentence completeness is asserted as content honesty only — the type-scale claim rests on (b) + (c) + (d), never on the sentence check | `npx vitest run src/components/proof-stale-sentence.test.tsx` | exit 0 | |
| P-3 | staleness-consequence | composition-hierarchy | The stale notice lives INSIDE the `tap-proof-disclosure` definition list, never a new competing banner — `src/components/proof-stale-placement.test.tsx` locates the rendered notice between the list's opening tag and its closing `</dl>` | `npx vitest run src/components/proof-stale-placement.test.tsx` | exit 0 | |
| P-4 | staleness-consequence | color-contrast | Stale-state styling can only ride the stylesheet's existing class vocabulary, proven three ways: (a) rendered-markup allowlist — `src/components/proof-stale-classes.test.tsx` renders the real component via `renderToStaticMarkup` under a pinned stale pair, collects every `class` token on the notice element and its whole subtree, asserts each token is in the pinned allowlist `["text-muted-foreground"]`, asserts each allowlist entry already exists as a `.`-prefixed class selector in `src/styles.css` read at run time, and asserts no `style` attribute anywhere in the rendered component markup; (b) the stylesheet is byte-unchanged from law time, proven twice — the SAME test computes the sha256 of `src/styles.css` via `node:crypto` and asserts it equals the pinned law-time hash `2e72056271ae5914ea8b0cc7ba0a53db24f435d800c4e18376c1d2df6e7402c5`, and the proxy command independently re-verifies the same hash via `shasum`, so no new or altered rule can restyle the allowlisted classes via hex, rgb(), hsl(), or named colors, and the proof holds even when the test runs standalone; (c) belt-and-braces source absence — no inline hex literal and no `style=` in `src/components/recommendation-proof.tsx` | `npx vitest run src/components/proof-stale-classes.test.tsx && echo "2e72056271ae5914ea8b0cc7ba0a53db24f435d800c4e18376c1d2df6e7402c5  src/styles.css" \| shasum -a 256 -c - && ! grep -qE "#[0-9a-fA-F]{3,6}" src/components/recommendation-proof.tsx && ! grep -q "style=" src/components/recommendation-proof.tsx` | exit 0 | |
