# Decisions

## ADR-1 — Additive persistence behind the sink, a 90-day deterministic tripwire, and a positively-proven stale notice (adjusted after weighing the peer plan)

Pinned: journey events persist to a NEW additive Supabase table `journey_events` (guest
inserts under an anon policy mirroring the repo's own `feedback` precedent; admin-only
readback via `has_role`) reached through a `localStorage`-backed fire-and-forget queue
wired strictly DOWNSTREAM of the existing observable sink, so the e2e sink contract, the
recommendation engine (byte-pinned + parity-proven), and the decision surfaces' latency
are untouched by construction; props are allowlisted to merchant/category slugs and
amounts are never persisted. The staleness tripwire is a pure predicate with an injected
clock and a 90-day window shared by `RATES_VERIFIED_ON` and every `benefits.ts` row,
wired into the operator's own `npm run check` via a `TAP_TODAY`-pinnable vitest gate, and
the law proves the red direction executably (the gate MUST fail under a 2099 clock). The
customer consequence rides the existing "Rates verified" `<dd>` — byte-identical while
fresh, so the 45 snapshots hold. On the operator ruling (AT-P2-001 / AT-P4-001) the two
independent plans agreed on rendered-markup allowlist proofs plus a byte-pinned
`src/styles.css`; where they diverged, this adjustment keeps the tighter side: the
allowlist stays the single verified pre-existing class `["text-muted-foreground"]`
(the peer's second entry `tap-proof-muted` is scoped to `.tap-proof-choice` in the
pinned stylesheet and is inert inside the disclosure, so admitting it proves nothing),
and P-2 keeps the positive type-scale proof — containment in the "Rates verified" `<dd>`
plus asserted existence of the `.tap-proof-disclosure dd` selector — rather than leaning
on inside-the-`<dl>` placement, which admits a notice outside any `<dd>`. One tightening
was adopted FROM the peer: the P-4 test now also asserts the stylesheet's pinned sha256
internally via `node:crypto`, so the byte-pin holds even when the test runs standalone,
with the check command's `shasum` verification kept as the independent second witness.
