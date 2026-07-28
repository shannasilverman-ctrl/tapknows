# Feasibility candidate — TAP: journey instrumentation + rate-staleness tripwire

*Research-sweep read against the six canonical areas. Brownfield target at
`/Users/shannasilverman/Documents/Codex/2026-07-25/usin/tap`, live production at
tapknows.com with no staging route. Every claim below traces to the project brief
(`.kiln/docs/project-brief.md`), the codebase map (`.kiln/docs/codebase-map.md`), or files
inspected on disk during this sweep. Repair pass 1: regenerated against all six findings in
`.kiln/feasibility-gate.json`.*

## 1. Platform feasibility — QUALIFIES

**Assumption:** the Cloudflare Workers runtime (nitro build, `compatibility_date:
2025-09-24`, `nodejs_compat`) can run new server functions that write journey events to
Supabase, and the repo gate (`npm run check`) can host a date-freshness check without new
runtime dependencies.

**Evidence:** the platform already does both halves of this in source. Server functions
built with `createServerFn` from `@tanstack/react-start` exist and call Supabase today —
`src/lib/analytics.functions.ts` carries `startSession` (inserts into `user_sessions`,
upserts `user_daily_active`), `pingSession`, and `getAdminStats`, all executing inside the
same worker entry (`src/server.ts`, bound by `wrangler.jsonc`). A journey-event server
function is the same shape: another `createServerFn` calling `@supabase/supabase-js`. For
the tripwire, `npm run check` chains prettier → eslint → tsc → vitest → build
(`package.json`), and `src/lib/cardCatalog.test.ts:37` already asserts a property of every
catalog row's `rates_verified_on` — a freshness assertion is an extension of an existing
vitest pattern, no new tooling. These files exist on disk; note the limit of that evidence:
it establishes the pattern in source, and the production deployment at tapknows.com was not
runtime-verified during this sweep.

**Recorded uncertainty:** the offline-survival requirement ("events survive being sent
while offline") needs a client-side queue (e.g. `localStorage`-backed) flushed when
connectivity returns. The repo holds the ingredients — `src/lib/guestWallet.ts` is a typed
`localStorage` wrapper (key `card_savvy_guest_wallet_v1`) that persists guest state across
sessions, and `src/hooks/use-online.ts` reads `navigator.onLine` — but no existing code
composes them into a queue-and-flush loop. That composition is new code whose behaviour is
unverified until built. What the guest-wallet precedent proves is only what is in source:
the pattern for surviving-signed-out local persistence exists on disk and is exercised by
the sign-in migration path (`migrate_guest_wallet` RPC per the codebase map); this sweep
did not verify its behaviour in the deployed production app.

**Reversibility cost:** low. A new server function and a client queue are additive modules;
undoing them is deleting the files and the call sites in the three emitting surfaces. The
observable-sink contract (`window.__tapJourneyEvents`, tested at
`e2e/product-system.spec.ts:283-304`) stays untouched either way. The tripwire is a test
file plus a script entry; undoing it is deletion.

## 2. Licensing — NOT APPLICABLE

**Assumption checked:** the build adds no new dependency, so no new license enters the
tree; the work rides the already-vendored stack.

**Evidence:** license metadata read from installed package metadata during this sweep
(`node_modules/<pkg>/package.json`, field `license`): `@supabase/supabase-js` 2.106.0 MIT,
`@tanstack/react-start` 1.168.6 MIT, `@tanstack/react-router` 1.170.4 MIT,
`@tanstack/react-query` 5.100.11 MIT, `react` 19.2.6 MIT, `zod` 3.25.76 MIT, `jose` 6.2.4
MIT, `react-plaid-link` 4.2.0 MIT. The compatibility basis: TAP's root `package.json` is
`"private": true` with no `license` field — a private, unpublished application consuming
MIT-licensed dependencies, which MIT's terms permit without copyleft obligation. This
verification covers the packages the planned work touches, not a full tree audit; a
transitive-dependency license audit was not performed and is recorded as out of scope for
this read.

**Reversibility cost:** none while the work adds no dependency — there is nothing to
unwind. If a plan later introduces a new package and its license proves incompatible,
reversing that means removing the package and reimplementing its role in-repo (for the
shapes in play here — a queue, a date check — that is hours, not a rewrite), since no
schema or wire format would depend on it.

## 3. External APIs — QUALIFIES

**Assumption:** the Supabase project (`supabase/config.toml` names project
`mrbjmclcylbfynblejdn`) will accept journey-event inserts from signed-out (anon-key)
clients once a policy permitting it exists.

**Evidence — on-disk precedent, deployment unverified:** migration
`supabase/migrations/20260717174222_….sql` creates `public.feedback` with `GRANT INSERT ON
public.feedback TO anon, authenticated` and policy `"anyone can insert feedback"` whose
`WITH CHECK` admits `auth.uid() IS NULL AND user_id IS NULL AND client_id IS NOT NULL`.
That is an on-disk policy precedent for exactly the guest-insert shape journey events need
— anon role, null user, required client identifier, row-shape constraints
(`feedback_owner_present`, length checks). What it does not prove: that this migration is
applied to the live project, or that an anonymous insert currently succeeds against it —
neither was runtime-verified during this sweep, and no deployment log was found on disk.
The honest state: the pattern is designed and committed; live acceptance is unverified
until a migration is applied and an anon insert is exercised (which the e2e recipe against
`wrangler dev --local` plus the real Supabase URL can do before any production deploy).

**Recorded uncertainty:** an anon-writable insert endpoint is abuse-exposed (spam rows,
volume). The feedback precedent mitigates with row constraints but has no rate limit on
disk. The same exposure transfers to journey events; a mitigation (row caps, cardinality
limits, or accepting the risk for low-value telemetry rows) must be chosen at law time.

**Reversibility cost:** low-to-moderate. A Supabase policy is one `DROP POLICY` migration
to revoke. Rows written under a bad policy persist until deleted — reversible with one
`DELETE`, but if genuinely sensitive props were logged, deletion is cleanup, not undo.
This argues for minimal event payloads from day one (see area 6).

## 4. Migrations — QUALIFIES

**Assumption:** journey events are best persisted in a new additive table created by a new
migration file, rather than by widening `user_sessions` / `user_daily_active`.

**Evidence for the recommendation:** both existing tables are shaped for authenticated
sessions, not guest event streams — `20260717033221_….sql` grants them to `authenticated`
only and their policies check `user_id = auth.uid()` (`"own sessions insert"`,
`"own dau insert"`). Fitting guest journey events into them would mean either loosening
those RLS policies (widening the write surface of tables the current auth model treats as
owner-only) or minting synthetic user ids. Neither is impossible — loosening RLS is a
one-migration change — so a new table is not a proven necessity; it is the recommended
additive design because it leaves the existing tables' security posture untouched, follows
the repo's own guest-write precedent (`feedback`, which got its own table with its own
anon policy rather than widening an existing one), and keeps the change purely additive to
schema history (21 existing migrations in `supabase/migrations/`, append-only by
convention). The alternative — extending existing tables — remains open at law time if a
reviewer prefers it; this read only establishes that both paths are feasible and that the
additive one carries less blast radius.

**Recorded uncertainty:** whether the operator wants guest events later reconciled to an
account (the `migrate_guest_wallet` RPC pattern suggests a reconciliation convention
exists for wallet state) is unresolved in the brief (brief assumption 4) and shapes the
table's key design (a `client_id` column mirroring `feedback.client_id` is compatible with
later reconciliation but does not implement it).

**Reversibility cost:** low. An additive table is dropped with one migration; no existing
table, policy, or query changes, so nothing else needs unwinding. Loosening existing-table
RLS instead would raise the cost of reversal: restoring the tightened policy plus auditing
what wrote to the widened surface in the interim.

## 5. Integrations — QUALIFIES

**Assumption:** journey persistence can be added without breaking the two integration
contracts the brief locks: the observable sink (e2e reads `window.__tapJourneyEvents`) and
the recommendation-engine parity (`src/lib/engineParity.test.ts`).

**Evidence:** the sink contract is narrow and inspectable — `src/lib/journeyEvents.ts`
keeps a module-level array mirrored onto `window`, and `e2e/product-system.spec.ts:283-304`
polls it for three named events. Persistence added *behind* `trackJourneyEvent` (write to
sink first, then enqueue for the server) leaves every existing reader untouched; the sink
stays synchronous and the network hop is downstream of it. Engine parity is untouched by
construction: journey instrumentation reads decisions, it does not make them —
`recommendationEngine.ts` needs no modification for either deliverable, and the tripwire
touches `cardCatalog.ts` dates and test files, not engine logic. The 45 PNG snapshots
(`e2e/consumer-visual.spec.ts-snapshots/`) constrain the *staleness consequence* surface:
any customer-visible pixel change trips them. The existing rates-date surface
(`see-the-math.tsx` passing `RATES_VERIFIED_ON` as `termsDate` into
`recommendation-proof.tsx`) is already rendered, so a consequence expressed through
existing rendered text is the lowest-snapshot-risk path — but whether the operator's
"honest consequence" fits in existing surfaces is not settled (brief assumption 2).

**Reversibility cost:** low for persistence (delete the queue/server-function modules;
sink and tests unchanged). Moderate for the consequence UI if it changes pixels: reverting
the UI is easy, but if snapshots were re-baselined to admit it, reverting means
re-baselining again — 45 files of churn each way, which is why the brief names them a
hazard.

## 6. Load-bearing performance or security — QUALIFIES

**Assumption (performance):** persistence can be made non-blocking so the decision
surfaces are not slowed, per the brief's hard requirement.

**Evidence and its limit:** the repo has an established non-blocking convention —
`src/hooks/use-session-tracking.ts` fires `startSession` and 60-second pings, swallows all
failures silently, and gates nothing in the UI on the result; the brief's own constraint
language ("must not block or slow") matches that convention. This makes non-blocking
journey persistence *feasible by design*: the queue-and-flush implementation can follow
the same fire-and-forget shape. But the precedent is evidence for the pattern, not for the
unbuilt implementation — no timing measurement of the new queue path exists because the
code does not exist, and a queue adds work the session hook does not do
(serialization, `localStorage` writes on the event path). Recorded as an honest gap:
implementation-level verification (that enqueue cost on the emit path is negligible and
that flush never runs on the interaction path) is still needed once built, e.g. as an
assertion in the existing e2e flow or a profiled check; it cannot be settled by precedent
alone.

**Assumption (security/time):** the staleness gate can be deterministic and honest.

**Evidence:** the codebase map flags the real hazard — a date-vs-now check inside `npm run
check` goes spontaneously red with the calendar. This is a design constraint, not a
blocker: the check's clock must be injectable/pinnable for CI determinism while the
default run uses real time — both behaviours are plain vitest capability already in the
toolchain. The exact freshness window (brief assumption 1) and whether `benefits.ts`'s 58
dated `verified_on` rows share it (brief assumption 6) are operator-policy choices, not
feasibility questions; any window value is equally implementable.

**Recorded uncertainty (privacy):** event props (merchant, category, amount) written to an
anon-writable table have no stated retention or PII policy (brief assumption 5). Amounts
tied to a persistent `client_id` are behavioural data. Feasibility is unaffected — the
mitigation (truncate/bucket amounts, cap retention) is cheap — but the policy choice is
unowned and must be made at law time, not defaulted silently.

**Reversibility cost:** performance shape — low; the queue is deletable and the sink
contract holds without it. Privacy — asymmetric: rows once written are only cleaned up,
not unwritten, so the cheap direction is starting minimal (fewest props, shortest
retention) and widening later; the expensive direction is logging rich props first and
redacting after.

## Findings resolved (repair pass 1)

- **F001** — licensing evidence now cites installed package license metadata
  (`node_modules/<pkg>/package.json`) for every load-bearing dependency, states the
  compatibility basis (private unpublished app over MIT deps), and records the
  transitive-audit gap explicitly (area 2).
- **F002** — the licensing area now states an explicit reversibility cost even as
  not-applicable (area 2).
- **F003** — the guest-wallet claim is reduced to what source proves: the pattern exists
  on disk and is wired to the sign-in migration path; deployed/runtime behaviour is
  recorded as unverified (area 1).
- **F004** — the feedback migration is presented as an on-disk policy precedent; live
  acceptance of anon inserts is recorded as unverified, with the verification path named
  (area 3).
- **F005** — the new table is recast as the recommended additive design under the current
  RLS posture, with the loosen-RLS alternative acknowledged as feasible and left open for
  law time (area 4).
- **F006** — non-blocking performance is stated as feasible by precedent but unverified
  for the unbuilt queue path, with the needed implementation-level evidence recorded as an
  honest gap (area 6).
