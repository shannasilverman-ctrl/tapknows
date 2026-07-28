# Decisions

## ADR-1 — Prior converged architecture carried; stale-notice styling proven by class allowlist plus a pinned stylesheet

This plan carries the architecture the prior law run already converged on and largely
ratified — a new additive RLS-on `journey_events` table (anon insert gated on non-null
`client_id`, admin-only select, `feedback`-migration precedent) fed by an unauthenticated
`createServerFn` ingress behind a pure ingest validator (nine canonical names, props
allowlisted to `merchant`/`category`, amounts never persisted), a `localStorage`-backed
fire-and-forget queue wired strictly downstream of the synchronous `__tapJourneyEvents`
sink so the e2e contract never changes, an admin-gated `getJourneyFunnel` readback beside
`getAdminStats` over a pure distinct-client funnel function, and a deterministic 90-day
freshness tripwire (`TAP_TODAY`-pinnable, negative-proven under a 2099 clock) whose
customer consequence renders through the existing "Rates verified" disclosure with a
byte-identical fresh path so the 45 snapshots hold — and pins the one thing the operator
ruled on: the ratify hold on AT-P2-001/AT-P4-001 rejected absence-only styling checks, so
P-2 and P-4 are TIGHTENED to rendered-markup proofs that the stale notice's element (P-2)
and its entire rendered subtree (P-4) carry only classes from the explicit pre-existing
allowlist `tap-proof-muted` / `text-muted-foreground` (class-less elements pass; the
tests verify each allowlist member exists as a class selector in `src/styles.css` read
from disk), carry no `style` attribute, and — closing the new-stylesheet-rule loophole
rgb()/hsl()/named-color greps cannot — that `src/styles.css` stays byte-identical to its
law-time sha256 `2e72056271ae5914ea8b0cc7ba0a53db24f435d800c4e18376c1d2df6e7402c5`,
asserted inside the P-4 test via `node:crypto`; the stylesheet pin is deliberate law (no
slice in this plan needs a stylesheet edit, and any such edit is exactly the
snapshot-brittleness hazard the brief names), so the notice's type scale and color can
only be what `.tap-proof-disclosure dd` already gives every disclosure row today, which
is what "honest, neither shouting nor vanishing" means executably.
