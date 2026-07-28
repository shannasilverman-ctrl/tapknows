# Repair delta — milestone `journey-instrumentation`, audit pass 2

Repairing review `32f12563-955d-4b8b-a9c5-350c82b49a71`
(law hash `396fdc250a27fb6adf5c1a0b6ee116003c9a9a18e4dc93df95db40a73f55419b`),
verdict `changes_required`, 2 findings, 0 blockers.

Criterion ownership read from `.kiln/LAW.md`: both findings are JP-4 →
`journey-persist`. One slice, so one section. Seals were not touched — nothing
here re-seals a repaired slice.

(Earlier deltas repaired F-JP4-001/002 and F-JR2-001/002 from review
`7902ff79`, plus a pre-audit pass on the same criterion. Those changes remain in
the tree untouched; the two findings below are what survived them.)

---

## Slice `journey-persist` — criterion JP-4

### F-JP4-003 — the reload flush aborted silently inside an import cycle

`src/lib/journeyQueue.ts:220`. The module graph closed a cycle:

```
journeyEvents.ts ──imports──> journeyQueue.ts ──imports──> journeyEvents.ts
journeyQueue.ts ──> journey.functions.ts ──> journeyIngest.ts ──> journeyEvents.ts
```

On a real reload the bundle enters through `journeyEvents.ts` (every surface
imports `trackJourneyEvent`, nothing imports the queue directly). ESM therefore
evaluates `journeyQueue.ts` to the bottom **before** `journeyEvents.ts` reaches
its `const KNOWN = new Set(...)`. The bottom of `journeyQueue.ts` called
`flush()` synchronously; with a nonempty stored queue that reached `readQueue` →
`toQueuedEvent` → `isJourneyEvent` → `KNOWN` in its temporal dead zone. The
`ReferenceError` landed in `flushJourneyQueue`'s own silent-failure `catch`, so
a queue persisted while offline or signed out looked healthy and never sent —
reloading online could not rescue it.

Repaired with **both** halves of the finding's `minimal_fix`, because either
alone leaves the shape that produced the bug:

**New `src/lib/journeyEventNames.ts`** — a leaf module with no imports at all,
holding `DECISION_FUNNEL_EVENTS`, `LEARNING_LOOP_EVENTS`, `JOURNEY_EVENTS`, the
three derived types, `KNOWN`, and `isJourneyEvent`. Byte-for-byte the same nine
names in the same order. A dependency-free leaf cannot participate in a cycle,
so every importer is guaranteed to see it fully evaluated.

**`src/lib/journeyEvents.ts`** — the vocabulary block is replaced by
`export { … } from "./journeyEventNames"` plus `export type { … }`, and the file
imports `isJourneyEvent` / `JourneyEvent` from the leaf for its own use.
`JOURNEY_EVENTS`, `DECISION_FUNNEL_EVENTS`, `LEARNING_LOOP_EVENTS`,
`isJourneyEvent`, and all three types remain exports of
`src/lib/journeyEvents.ts` with identical contents, so JP-3's "the complete
contents of the existing `JOURNEY_EVENTS` export in `src/lib/journeyEvents.ts`"
still reads true and no caller changed. The sink itself — `SINK_KEY`,
`bindWindowSink`, `trackJourneyEvent`, `readJourneyEvents`, `hasJourneyEvent`,
`resetJourneyEvents`, `JOURNEY_SINK_KEY`, and the sink-before-queue ordering
inside `trackJourneyEvent` — is completely unchanged (JP-5).

**`src/lib/journeyQueue.ts`** and **`src/lib/journeyIngest.ts`** — now import
`isJourneyEvent` / `JourneyEvent` from `./journeyEventNames`. Moving the
validator too matters: it is what makes `journey.functions.ts` (and therefore
the default `send`) fully evaluated by the time the reload flush runs. After
this there is no cycle anywhere in the journey graph.

**`src/lib/journeyQueue.ts` module-init block** — the reload flush is now handed
to a task (`defaultSchedule(flush)`, the same `setTimeout(…, 0)` the enqueue
path already used) instead of running during module evaluation. The whole module
graph finishes evaluating before the first byte of a persisted queue moves. The
`online` listener registration is unchanged.

Verified on the emitted browser bundle, which is what the finding's evidence
named: in `.output/public/assets/journeyEvents-*.js` the canonical set
(`R=new Set(L)`) is now constructed at offset ~9200, and the reload-flush block
(`if(typeof window<"u"){let e=()=>{X({})…};K(e),window.addEventListener("online",e)}`)
sits at ~11340 — set first, deferred flush second.

### F-JP4-004 — overlapping flushes deleted events neither had submitted

`src/lib/journeyQueue.ts:206`. Every flush snapshotted the queue independently
and then removed `snapshot.length` items from whatever was in storage at
acknowledgment time. Nothing serialized them: `flushPending` was cleared before
the async flush completed, and the module-init and `online` flushes never
consulted the latch at all. Snapshot `[A]`, then snapshot `[A,B]`, with `C`
appended while both were in flight — whichever acknowledgment landed second
sliced `C` out of storage although no flush had ever sent it.

Changes, all in `src/lib/journeyQueue.ts`:

- The old `flushJourneyQueue` body became private `drainJourneyQueue(opts)` —
  same logic, same `try/catch`, same `isFullBatchAck` retention rule.
- New module-level `flushChain: Promise<void>`. `flushJourneyQueue` is now a
  thin serializer: `flushChain.then(() => drainJourneyQueue(opts))`, reassigning
  the chain and returning the link. All four flush sources — post-enqueue
  schedule, module init, `online` event, direct test call — go through it, so
  two drains can never be in flight at once and each acknowledgment can only
  account for the batch it actually sent. `drainJourneyQueue` swallows
  everything, so the returned promise never rejects and fire-and-forget callers
  stay fire-and-forget.
- New `removeAcknowledgedBatch(storage, sent)` replaces the bare
  `readQueue(storage).slice(events.length)`. It re-reads the queue after the
  acknowledgment and removes the submitted batch **only if that batch is still
  the queue's head** (compared on `name` + `at`); otherwise it removes nothing.
  Enqueues only append and the chain excludes other drains, so the head check
  holds in normal operation — and if storage were ever rewritten underneath a
  flush, the failure mode is a retry, never a deletion.
- `__resetJourneyQueueForTest()` now resets `flushChain` alongside
  `flushPending`.

Behavior the criterion already pinned is untouched: retention on a
non-full-batch acknowledgment, silent failure, never throwing, unknown-name
rejection at enqueue, storage injectability, and the persistent guest
`client_id`.

### Tests added — `src/lib/journeyQueue.test.ts` (JP-4's own command)

The finding was explicit that the existing suite "only resets a latch and
rereads injected storage". Both new tests exercise the real thing, and both were
confirmed to FAIL against the pre-repair code and pass after:

- **"flushes a queue persisted by an earlier session when the browser module
  really initializes"** — writes a queue into storage under the production key,
  stubs a real `window` (`vi.stubGlobal`), calls `vi.resetModules()`, then
  dynamically imports **`./journeyEvents` first and `./journeyQueue` second**,
  reproducing the bundle's own entry order. Asserts the production server
  function received the persisted event, the queue drained, and the `online`
  listener was registered. Against the cycle + synchronous init flush it fails
  (the flush aborts and nothing is sent).
- **"never removes an event that no flush actually submitted"** — races a
  hanging flush against a second flush while a third event is appended between
  them, and asserts two things: `maxInFlight === 1` (drains really are
  serialized), and the invariant that matters — every enqueued event that no
  `send` received is still in the queue. Against the unserialized code the first
  assertion fails with `expected 2 to be 1`, and the invariant fails
  independently with `expected [] to include 'recommendation_viewed'`, which is
  the finding's scenario exactly.
- New `sentEventNames()` helper reads the names the mocked server function
  actually received across all calls.

---

## Verification

- `npx vitest run src/lib/journeyQueue.test.ts` — 19/19 passed (17 before, +2).
- The journey suites together (`journeyQueue`, `journeyEvents`, `journeyIngest`,
  `journey.functions`, `journeyMigration`, `analyticsJourney`) — 57/57 passed.
- `npm run check` — exit 0 (format, lint, typecheck, unit tests, build). GT-1.
- Bug-catching proven by reversion, not assumed: with the cycle and synchronous
  init flush restored, the reload test fails; with the serializer and head-check
  removed, the concurrency test fails on both of its assertions. Both were then
  restored and re-verified green.
- `bash .kiln/law/check.sh` — exit 1 printing
  `["rate-freshness-gate","staleness-consequence"]`. Neither `journey-persist`
  nor `journey-readback` appears: every criterion of the audited milestone is
  green. The two named slices belong to the `rate-staleness` milestone and are
  still unbuilt — unchanged pre-existing state, identical to the reading before
  this repair, and unrelated to it.

## Scope

Touched: `src/lib/journeyEventNames.ts` (new), `src/lib/journeyEvents.ts`,
`src/lib/journeyQueue.ts`, `src/lib/journeyIngest.ts`,
`src/lib/journeyQueue.test.ts`.

Not touched: `src/lib/recommendationEngine.ts` (JP-6 baseline hash),
`src/styles.css` (P-4 byte pin), every migration incl. the new one (JP-1
manifest and test), `src/lib/journey.functions.ts` (JP-2 — no auth middleware
introduced, validation-before-insert untouched), the `__tapJourneyEvents` sink
contract and the sink-first ordering in `trackJourneyEvent` (JP-5),
`src/lib/journeyFunnel.ts` (JR-1), `src/lib/analytics.functions.ts` and the
`getJourneyFunnel` declaration chain (JR-2), and every route, component, and e2e
spec.
