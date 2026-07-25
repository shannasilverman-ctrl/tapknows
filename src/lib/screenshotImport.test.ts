import { describe, expect, it } from "vitest";
import { matchNames } from "./screenshotImport";

describe("screenshotImport.matchNames", () => {
  it("matches truncated Apple Pay names via prefix", () => {
    const r = matchNames(["Chase Freedom Unli"]);
    expect(r.unmatched).toEqual([]);
    expect(r.matched[0].candidates.map((c) => c.id)).toContain("chase_freedom_unlimited");
  });

  it("treats ambiguous Chase Sapphire as multi-candidate", () => {
    const r = matchNames(["Chase Sapphire"]);
    expect(r.matched).toHaveLength(1);
    const ids = r.matched[0].candidates.map((c) => c.id);
    expect(ids).toContain("chase_csp");
    expect(ids).toContain("chase_csr");
  });

  it("matches Prime Visa without the issuer prefix", () => {
    const r = matchNames(["Prime Visa"]);
    expect(r.matched[0].candidates.map((c) => c.id)).toContain("chase_amazon_prime_visa");
  });

  it("routes unknown cards to unmatched (Apple Card is not in catalog)", () => {
    const r = matchNames(["Apple Card"]);
    expect(r.matched).toHaveLength(0);
    expect(r.unmatched).toEqual(["Apple Card"]);
  });

  it("full mixed screenshot: several matches, one ambiguity, one unmatched", () => {
    const r = matchNames([
      "Amazon Prime Visa",
      "Chase Freedom Unli",
      "Chase Sapphire",
      "Apple Card",
    ]);
    expect(r.matched).toHaveLength(3);
    expect(r.unmatched).toEqual(["Apple Card"]);
    const sapphire = r.matched.find((m) => m.input === "Chase Sapphire");
    expect(sapphire?.candidates.length).toBeGreaterThan(1);
  });
});
