import { describe, expect, it } from "vitest";
import { BENEFITS, BENEFITS_BY_CARD } from "./benefits";
import { CATALOG_BY_ID } from "./cardCatalog";

describe("benefit registry coverage", () => {
  it("covers at least 10 catalog card ids", () => {
    const covered = Object.keys(BENEFITS_BY_CARD).filter(
      (id) => (BENEFITS_BY_CARD[id]?.length ?? 0) > 0,
    );
    expect(covered.length).toBeGreaterThanOrEqual(10);
  });

  it("every benefit row cites an https source", () => {
    // Uncited coverage cannot be counted. A row whose `source` (or, for
    // standing entries, `source_url`) is not an https URL is not evidence.
    const uncited = BENEFITS.filter((b) => {
      const url = b.source_url ?? b.source;
      return typeof url !== "string" || !url.startsWith("https://");
    });
    expect(uncited.map((b) => b.id)).toEqual([]);
  });

  it("only claims benefits for cards that exist in the catalog", () => {
    const unknown = BENEFITS.filter((b) => !CATALOG_BY_ID[b.card_catalog_id]);
    expect(unknown.map((b) => b.id)).toEqual([]);
  });

  it("uses unique benefit ids", () => {
    const ids = BENEFITS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps standing benefits out of money math", () => {
    // Standing entries are reference only — a value would let them leak into
    // the recommendation's earn math.
    for (const b of BENEFITS.filter((x) => x.kind === "standing")) {
      expect(b.value_cents).toBeNull();
    }
  });

  it("gives every redeemable benefit a positive value in cents", () => {
    for (const b of BENEFITS.filter((x) => x.kind === "redeemable")) {
      expect(b.value_cents).not.toBeNull();
      expect(b.value_cents ?? 0).toBeGreaterThan(0);
    }
  });
});
