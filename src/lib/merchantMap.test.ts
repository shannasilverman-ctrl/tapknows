import { describe, it, expect } from "vitest";
import { resolveMerchant, searchMerchants, MERCHANTS } from "./merchantMap";

describe("merchantMap", () => {
  it("resolves 'sams club', 'sam's', and 'SAMS' to Sam's Club", () => {
    const a = resolveMerchant("sams club");
    const b = resolveMerchant("sam's");
    const c = resolveMerchant("SAMS");
    expect(a?.name).toBe("Sam's Club");
    expect(b?.name).toBe("Sam's Club");
    expect(c?.name).toBe("Sam's Club");
    expect(a?.category).toBe("wholesale_clubs");
  });

  it("fuzzy-resolves 'wholefoods' to Whole Foods", () => {
    const r = resolveMerchant("wholefoods");
    expect(r?.name).toBe("Whole Foods");
    expect(r?.category).toBe("whole_foods");
  });

  it("returns null for unknown strings without crashing", () => {
    expect(resolveMerchant("qwertyzzz12345")).toBeNull();
    expect(resolveMerchant("")).toBeNull();
  });

  it("distinguishes Costco (wholesale) from Costco Gas (gas)", () => {
    expect(resolveMerchant("costco gas")?.category).toBe("gas");
    expect(resolveMerchant("costco wholesale")?.category).toBe("wholesale_clubs");
  });

  it("maps Amazon to amazon and Walmart to everything_else with a note", () => {
    const amz = resolveMerchant("amazon");
    expect(amz?.category).toBe("amazon");
    const wm = resolveMerchant("walmart");
    expect(wm?.category).toBe("everything_else");
    expect(wm?.note).toMatch(/general retail/i);
  });

  it("handles typos within one edit", () => {
    const r = resolveMerchant("chiptole"); // chipotle typo
    expect(r?.name).toBe("Chipotle");
  });

  it("returns multiple candidates for ambiguous prefix", () => {
    const results = searchMerchants("pa");
    expect(results.length).toBeGreaterThan(1);
  });

  it("every entry uses a snake_case category slug", () => {
    for (const e of MERCHANTS) {
      expect(e.category).toMatch(/^[a-z_]+$/);
    }
  });
});
