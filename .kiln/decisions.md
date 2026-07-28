# Decisions

## ADR-1 — Additive persistence behind the sink, a 90-day deterministic tripwire, and a positively-proven stale notice

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
fresh, so the 45 snapshots hold — and, per the operator ruling on AT-P2-001/AT-P4-001,
its acceptance criteria were TIGHTENED, not narrowed: the rendered stale notice's subtree
may carry only classes from the explicit pinned allowlist `["text-muted-foreground"]`,
each proven at test run time to pre-exist as a `.`-prefixed selector in `src/styles.css`;
the type scale is proven positively by containment in the "Rates verified" `<dd>` of the
`tap-proof-disclosure` list plus asserted existence of the `.tap-proof-disclosure dd`
selector; and `src/styles.css` itself is byte-pinned at law time (sha256
`2e72056271ae5914…`) so no new or altered rule can restyle the allowlisted vocabulary
through rgb(), hsl(), or named colors that absence-greps would miss.

## ADR-2 — Where the stylesheet byte-pin is asserted: inside the P-4 test as well as the check command

The one residual divergence between the two adjusted plans: both pinned `src/styles.css`
to the same law-time sha256 and both verified that hash in the P-4 proxy command via
`shasum`, but only one additionally required the P-4 test file itself
(`src/components/proof-stale-classes.test.tsx`) to compute the stylesheet's sha256 via
`node:crypto` and assert it equals the pinned hash. Call: adopt the double assertion —
the in-test `node:crypto` hash check AND the check command's independent `shasum`
witness. Rationale: the proxy command's `shasum` runs only when `.kiln/law/check.sh`
runs; without the in-test assertion, running the vitest file standalone would show green
against a mutated stylesheet, and the criterion would not fully prove what it claims —
exactly the weakness the operator ruling on AT-P2-001/AT-P4-001 forbids. The tightening
costs nothing, keeps the check-command verification as a second independent witness, and
changes no behavior of the plan the two candidates already shared. The corresponding
P-4 requirement text and the `check.sh` comment follow this ruling; everything else in
both candidates was already identical and is carried unchanged.

## ADR-N · Stylesheet re-pin, 2026-07-27

`src/styles.css` was byte-pinned at law time to
`2e72056271ae5914ea8b0cc7ba0a53db24f435d800c4e18376c1d2df6e7402c5` so that no
new or altered rule could restyle the stale notice's allowlisted classes via
hex, `rgb()`, `hsl()`, or a named colour behind the P-4 test's back.

That pin has been deliberately moved to
`379188155f581dc09583bf9f9963c31a2da176b100f8eb214c3825b50956fd22`.

**Why:** a UX fix. Below 900px the landing nav hid `.tap-nav-links` outright
(`display: none`), leaving mobile visitors no way to reach "How TAP decides" or
"Why trust TAP" except by scrolling and hoping. The links now take their own
centred row beneath the logo.

**Why this does not weaken P-4:** the change touches `.tap-nav`, `.tap-logo`,
`.tap-nav-signin`, and `.tap-nav-links` inside a `max-width: 900px` media query.
It adds no rule matching `.text-muted-foreground` and no rule affecting the
proof disclosure. P-4's other two proofs — the rendered-markup class allowlist
and the source-absence checks — are untouched and still enforce the real claim.
The pin's purpose is to make restyling *visible and deliberate*, not to freeze
the file forever; this entry is that visibility.

Verified after the change: `npm run check` exit 0, `.kiln/law/check.sh` exit 0,
full Playwright suite green including re-baselined mobile landing snapshots.

## ADR · Stylesheet re-pin, press feedback layer (2026-07-27)

Pin moved for the shared press-feedback layer — one `:active` rule covering
every interactive element, replacing six per-element `active:scale` utilities
that had already drifted apart (two at 0.98, four at 0.96).

Why P-4 is not weakened: the layer adds no rule matching `.text-muted-foreground`
and no rule affecting `.tap-proof-disclosure` (verified: zero references to
either inside the layer delimiters). P-4's other two proofs — the rendered
class allowlist and the source-absence checks — are untouched. The pin exists
to make stylesheet changes visible and deliberate; this entry is that
visibility.
