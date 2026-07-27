// The rate-staleness tripwire. Runs inside `npm test` and therefore inside
// `npm run check` (see package.json's `check` script) — this file's own
// pass/fail IS the gate. It validates RATES_VERIFIED_ON (src/lib/cardCatalog.ts)
// and every `verified_on` row on `BENEFITS` (src/lib/benefits.ts) against the
// current date, using the SAME freshness window as rateFreshness.ts.
//
// Pinnable via TAP_TODAY (YYYY-MM-DD) for CI determinism. Set it to a
// far-future date and this file MUST fail — that failure is the tripwire
// doing its job, not a bug to fix.

import { describe, expect, it } from "vitest";
import { RATE_FRESHNESS_WINDOW_DAYS, isRateStale } from "./rateFreshness";
import { RATES_VERIFIED_ON } from "./cardCatalog";
import { BENEFITS } from "./benefits";

function gateToday(): Date {
  const pinned = process.env.TAP_TODAY;
  if (pinned) return new Date(`${pinned}T00:00:00.000Z`);
  return new Date();
}

describe("rate freshness gate", () => {
  it(`RATES_VERIFIED_ON is within the ${RATE_FRESHNESS_WINDOW_DAYS}-day window`, () => {
    const today = gateToday();
    expect(isRateStale(RATES_VERIFIED_ON, today)).toBe(false);
  });

  it(`every benefits.ts verified_on row is within the ${RATE_FRESHNESS_WINDOW_DAYS}-day window`, () => {
    const today = gateToday();
    const staleRows = BENEFITS.filter(
      (b) => b.verified_on !== undefined && isRateStale(b.verified_on, today),
    ).map((b) => `${b.id} (verified_on=${b.verified_on})`);

    expect(staleRows).toEqual([]);
  });
});
