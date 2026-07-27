// SC-1 · the honest, snapshot-safe rate-age label.
//
// The fresh path must be byte-identical to the raw date — that identity is what
// keeps the 45 existing visual snapshots green while rates are current. Both
// paths run under pinned clocks, never real time.

import { describe, expect, it } from "vitest";
import { describeRateAge } from "./rateAge";
import { RATE_FRESHNESS_WINDOW_DAYS } from "./rateFreshness";

const VERIFIED_ON = "2026-01-01";

/** 206 days after VERIFIED_ON — comfortably past the 90-day window. */
const STALE_TODAY = new Date("2026-07-26T00:00:00.000Z");
/** 25 days after VERIFIED_ON — inside the window. */
const FRESH_TODAY = new Date("2026-01-26T00:00:00.000Z");

describe("describeRateAge", () => {
  it("fresh path returns the verifiedOn string EXACTLY (snapshot-safe)", () => {
    const out = describeRateAge(VERIFIED_ON, FRESH_TODAY);

    expect(out).toBe(VERIFIED_ON);
    expect(out.length).toBe(VERIFIED_ON.length);
  });

  it("fresh path stays byte-identical right up to the window boundary", () => {
    // Exactly RATE_FRESHNESS_WINDOW_DAYS old is still fresh — stale is > window.
    const boundary = new Date("2026-01-01T00:00:00.000Z");
    boundary.setUTCDate(boundary.getUTCDate() + RATE_FRESHNESS_WINDOW_DAYS);

    expect(describeRateAge(VERIFIED_ON, boundary)).toBe(VERIFIED_ON);
  });

  it("stale path names the verified date and the age", () => {
    const out = describeRateAge(VERIFIED_ON, STALE_TODAY);

    expect(out).not.toBe(VERIFIED_ON);
    expect(out).toContain(VERIFIED_ON);
    expect(out).toContain(String(RATE_FRESHNESS_WINDOW_DAYS));
    expect(out.endsWith(".")).toBe(true);
  });

  it("trips one day past the window, not before", () => {
    const justPast = new Date("2026-01-01T00:00:00.000Z");
    justPast.setUTCDate(justPast.getUTCDate() + RATE_FRESHNESS_WINDOW_DAYS + 1);

    expect(describeRateAge(VERIFIED_ON, justPast)).not.toBe(VERIFIED_ON);
  });
});
