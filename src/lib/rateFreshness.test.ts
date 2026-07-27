import { describe, expect, it } from "vitest";
import { RATE_FRESHNESS_WINDOW_DAYS, isRateStale } from "./rateFreshness";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAfter(verifiedOn: string, days: number): Date {
  return new Date(new Date(`${verifiedOn}T00:00:00.000Z`).getTime() + days * DAY_MS);
}

describe("rateFreshness", () => {
  it("exposes a 90-day freshness window", () => {
    expect(RATE_FRESHNESS_WINDOW_DAYS).toBe(90);
  });

  it("is fresh at exactly the window boundary (90 days)", () => {
    const verifiedOn = "2026-01-01";
    const today = daysAfter(verifiedOn, RATE_FRESHNESS_WINDOW_DAYS);
    expect(isRateStale(verifiedOn, today)).toBe(false);
  });

  it("is stale one day past the window boundary (91 days)", () => {
    const verifiedOn = "2026-01-01";
    const today = daysAfter(verifiedOn, RATE_FRESHNESS_WINDOW_DAYS + 1);
    expect(isRateStale(verifiedOn, today)).toBe(true);
  });

  it("is fresh on the verification date itself", () => {
    const verifiedOn = "2026-01-01";
    const today = daysAfter(verifiedOn, 0);
    expect(isRateStale(verifiedOn, today)).toBe(false);
  });
});
