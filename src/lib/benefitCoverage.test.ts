import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID } from "./cardCatalog";
import { BENEFITS_BY_CARD } from "./benefits";
import { UNVERIFIED_COPY, benefitCoverage, isBenefitVerified } from "./benefitCoverage";

describe("benefitCoverage", () => {
  it("reports a card with sourced benefit rows as verified", () => {
    expect(BENEFITS_BY_CARD["chase_csp"]?.length ?? 0).toBeGreaterThan(0);
    expect(benefitCoverage("chase_csp")).toBe("verified");
  });

  it("reports a catalog card without benefit rows as not yet verified", () => {
    // citi_double_cash is a real catalog card; TAP has no sourced rows for it.
    expect(CATALOG_BY_ID["citi_double_cash"]).toBeDefined();
    expect(BENEFITS_BY_CARD["citi_double_cash"]).toBeUndefined();
    expect(benefitCoverage("citi_double_cash")).toBe("not_yet_verified");
  });

  it("reports an unknown card id as not yet verified rather than benefit-free", () => {
    expect(benefitCoverage("no_such_card")).toBe("not_yet_verified");
  });

  it("exposes the same answer through the boolean helper", () => {
    expect(isBenefitVerified("chase_csp")).toBe(true);
    expect(isBenefitVerified("citi_double_cash")).toBe(false);
  });

  it("pins the exact unverified copy so surfaces never improvise it", () => {
    expect(UNVERIFIED_COPY).toBe("Not yet verified in TAP");
  });

  it("never reports a catalog card as verified without an https citation", () => {
    for (const id of Object.keys(CATALOG_BY_ID)) {
      if (benefitCoverage(id) !== "verified") continue;
      const rows = BENEFITS_BY_CARD[id] ?? [];
      const cited = rows.some((b) => (b.source_url ?? b.source ?? "").startsWith("https://"));
      expect(cited).toBe(true);
    }
  });
});
