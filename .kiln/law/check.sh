#!/usr/bin/env bash
# LAW check — TAP: journey instrumentation + rate-staleness tripwire.
# Runs from the project root: `bash .kiln/law/check.sh`.
# Exits 0 iff every criterion is green; on any red prints the owning slice
# ids of every failed criterion as a JSON array of strings on stdout.
# No dependencies beyond bash + shasum + the repo's own toolchain (npm/npx).
set -u

STYLES_SHA256="d7c5e486ff034ed5733a8b679c79e709e14dcecb5ad3139a59d761e6f28faeb3"

[ -f package.json ] || { echo '["journey-persist","journey-readback","rate-freshness-gate","staleness-consequence"]'; exit 1; }

FAILED_SLICES=""

mark() {
  case " $FAILED_SLICES " in
    *" $1 "*) ;;
    *) FAILED_SLICES="$FAILED_SLICES $1" ;;
  esac
}

# --- journey-persist -------------------------------------------------------

# GT-1: the operator's repository gate stays green (and carries the tripwire's teeth).
npm run check >/dev/null 2>&1 || mark "journey-persist"

# JP-1: additive migration — pinned journey_events schema + policy semantics proven by
# the executable migration test; prior migrations byte-unchanged per law-time manifest.
jp1() {
  shasum -a 256 -c .kiln/law/migrations-baseline.sha256 &&
    npx vitest run src/lib/journeyMigration.test.ts
}
jp1 >/dev/null 2>&1 || mark "journey-persist"

# JP-2: guest-capable ingress — handler test proves validation precedes every insert and
# invalid input inserts nothing; no auth middleware in the file.
jp2() {
  npx vitest run src/lib/journey.functions.test.ts &&
    ! grep -q "requireSupabaseAuth" src/lib/journey.functions.ts
}
jp2 >/dev/null 2>&1 || mark "journey-persist"

# JP-3: pure ingest validator — the nine canonical names only, props allowlisted, amounts stripped.
npx vitest run src/lib/journeyIngest.test.ts >/dev/null 2>&1 || mark "journey-persist"

# JP-4: durable queue — offline/signed-out survival, flush, silent failure, unknown-name rejection.
npx vitest run src/lib/journeyQueue.test.ts >/dev/null 2>&1 || mark "journey-persist"

# JP-5: sink-first wiring — sink API unchanged, queue downstream of the sink.
jp5() {
  npx vitest run src/lib/journeyEvents.test.ts >/dev/null 2>&1 &&
    grep -q "__tapJourneyEvents" src/lib/journeyEvents.ts &&
    grep -q "journeyQueue" src/lib/journeyEvents.ts
}
jp5 >/dev/null 2>&1 || mark "journey-persist"

# JP-6: engine untouched — baseline hash intact AND behavioral parity green.
jp6() {
  shasum -a 256 -c .kiln/law/engine-baseline.sha256 &&
    npx vitest run src/lib/engineParity.test.ts
}
jp6 >/dev/null 2>&1 || mark "journey-persist"

# --- journey-readback ------------------------------------------------------

# JR-1: funnel arithmetic unit-proven under the pinned semantics (distinct client_id per
# step, canonical order, null drop-off on first step and zero denominators).
npx vitest run src/lib/journeyFunnel.test.ts >/dev/null 2>&1 || mark "journey-readback"

# JR-2: admin-gated funnel readback — structural gating assertion + fake-client
# journey_events read proven by the analytics journey test.
npx vitest run src/lib/analyticsJourney.test.ts >/dev/null 2>&1 || mark "journey-readback"

# --- rate-freshness-gate ---------------------------------------------------

# RF-1: deterministic freshness core, both boundary sides pinned (fresh@90, stale@91).
npx vitest run src/lib/rateFreshness.test.ts >/dev/null 2>&1 || mark "rate-freshness-gate"

# RF-2: the gate MUST go red under a far-future clock.
rf2() {
  [ -f src/lib/rateFreshness.gate.test.ts ] || return 1
  if TAP_TODAY=2099-01-01 npx vitest run src/lib/rateFreshness.gate.test.ts >/dev/null 2>&1; then
    return 1
  fi
  return 0
}
rf2 >/dev/null 2>&1 || mark "rate-freshness-gate"

# RF-3: gate green at the real clock, benefits rows covered.
rf3() {
  grep -q "benefits" src/lib/rateFreshness.gate.test.ts &&
    npx vitest run src/lib/rateFreshness.gate.test.ts >/dev/null 2>&1
}
rf3 >/dev/null 2>&1 || mark "rate-freshness-gate"

# --- staleness-consequence -------------------------------------------------

# SC-1: honest, snapshot-safe label helper (fresh path byte-identical).
npx vitest run src/lib/rateAge.test.ts >/dev/null 2>&1 || mark "staleness-consequence"

# SC-2: proof surface renders describeRateAge on both pinned paths (rendered-markup test).
npx vitest run src/components/recommendation-proof.test.tsx >/dev/null 2>&1 || mark "staleness-consequence"

# --- perceptual proxies (owned by staleness-consequence) ---------------------

# P-1: fidelity-to-requirement — stale notice visible in the rendered disclosure.
npx vitest run src/components/proof-stale-notice.test.tsx >/dev/null 2>&1 || mark "staleness-consequence"

# P-2: typography — complete stale sentence PLUS positive type-scale proof: notice inside
# the disclosure <dd> (whose `.tap-proof-disclosure dd` rule the test asserts exists in
# src/styles.css), only allowlisted pre-existing classes in the notice subtree, no inline
# style attribute.
npx vitest run src/components/proof-stale-sentence.test.tsx >/dev/null 2>&1 || mark "staleness-consequence"

# P-3: composition-hierarchy — notice nested inside the tap-proof-disclosure list.
npx vitest run src/components/proof-stale-placement.test.tsx >/dev/null 2>&1 || mark "staleness-consequence"

# P-4: color-contrast — rendered-markup class allowlist (only pre-existing stylesheet
# classes on the stale notice subtree), stylesheet byte-pinned at law time and asserted
# BOTH inside the test (node:crypto sha256 vs the pinned hash, so the proof holds when
# the test runs standalone) AND here via shasum, plus belt-and-braces source absence of
# hex literals and inline styles.
p4() {
  npx vitest run src/components/proof-stale-classes.test.tsx || return 1
  echo "$STYLES_SHA256  src/styles.css" | shasum -a 256 -c - || return 1
  [ -f src/components/recommendation-proof.tsx ] || return 1
  if grep -qE "#[0-9a-fA-F]{3,6}" src/components/recommendation-proof.tsx; then
    return 1
  fi
  if grep -q "style=" src/components/recommendation-proof.tsx; then
    return 1
  fi
  return 0
}
p4 >/dev/null 2>&1 || mark "staleness-consequence"

# --- verdict ----------------------------------------------------------------

if [ -n "$FAILED_SLICES" ]; then
  out="["
  first=1
  for s in $FAILED_SLICES; do
    if [ "$first" -eq 1 ]; then first=0; else out="$out,"; fi
    out="$out\"$s\""
  done
  out="$out]"
  echo "$out"
  exit 1
fi

exit 0
