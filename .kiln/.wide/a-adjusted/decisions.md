# Decisions

## ADR-1 — Additive persistence behind the sink, a 90-day deterministic tripwire, and a positively-proven stale notice

Pinned: journey events persist to a NEW additive Supabase table `journey_events` (guest
inserts under an anon policy mirroring the repo's own `feedback` precedent; admin-only
readback via `has_role`) reached through a `localStorage`-backed fire-and-forget queue
wired strictly DOWNSTREAM of the existing observable sink, so the e2e sink contract,
the recommendation engine (byte-pinned + parity-proven), and the decision surfaces'
latency are untouched by construction; props are allowlisted to merchant/category slugs
and amounts are never persisted, because anon-writable rows are only cleaned up, never
unwritten. The staleness tripwire is a pure predicate with an injected clock and a
90-day window shared by `RATES_VERIFIED_ON` and every `benefits.ts` row, wired into the
operator's own `npm run check` via a vitest gate file pinnable with `TAP_TODAY`, and the
law proves the red direction executably (the gate MUST fail under a 2099 clock). The
customer consequence rides the existing "Rates verified" `<dd>` — byte-identical while
fresh, so the 45 snapshots hold — and, per the operator ruling on AT-P2-001/AT-P4-001,
its acceptance criteria were TIGHTENED, not narrowed: the rendered stale notice's
subtree may carry only classes from the explicit pinned allowlist
`["text-muted-foreground"]`, each proven at test run time to pre-exist as a selector in
`src/styles.css`, the type scale is proven by containment in the `.tap-proof-disclosure
dd` rule's scope (selector existence asserted), and `src/styles.css` itself is
byte-pinned at law time (sha256 `2e72056271ae5914…`) so no new rule can restyle the
allowlisted vocabulary through rgb(), hsl(), or named colors that absence-greps would
miss.
