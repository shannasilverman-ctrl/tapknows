import { describe, expect, it } from "vitest";
import { canonicalPurchaseCategory, earnedPointsFromEngineLeg } from "./purchaseReview";
import { recommend, type EngineCard, type PlayLeg } from "./recommendationEngine";

const leg = (baseEarnCents: number, offerValueCents = 0): PlayLeg => ({
  userCardId: "card",
  cardLabel: "Card",
  amountCents: 10_000,
  baseEarnCents,
  offerValueCents,
  reason: "base earn",
});

describe("purchase review category normalization", () => {
  it.each([
    ["drugstore", "drugstores"],
    ["online", "online_shopping"],
    ["other", "everything_else"],
    ["all", "everything_else"],
    ["hotel", "hotels"],
    ["airline", "flights"],
    ["Dining", "dining"],
  ])("maps %s to %s", (input, expected) => {
    expect(canonicalPurchaseCategory(input)).toBe(expected);
  });
});

describe("engine-derived earned points", () => {
  it("converts the engine's cap-aware base value back to points", () => {
    expect(earnedPointsFromEngineLeg(leg(615), 2.05)).toBe(300);
  });

  it("does not turn offer credits into points", () => {
    expect(earnedPointsFromEngineLeg(leg(205, 5_000), 2.05)).toBe(100);
  });

  it("never estimates points for invalid valuations or negative net earn", () => {
    expect(earnedPointsFromEngineLeg(leg(205), 0)).toBe(0);
    expect(earnedPointsFromEngineLeg(leg(-100), 2.05)).toBe(0);
  });

  it("estimates post-cap points from the engine rather than the headline multiplier", () => {
    const card: EngineCard = {
      id: "gold",
      card_catalog_id: "gold",
      issuer: "Issuer",
      name: "Gold",
      points_program_id: "points",
      foreign_tx_fee_pct: 0,
      earn_rules: [
        {
          category: "dining",
          multiplier: 4,
          cap_period_spend: 1_000,
          cap_period: "annual",
        },
        { category: "everything_else", multiplier: 1 },
      ],
    };
    const result = recommend({
      amountCents: 10_000,
      category: "dining",
      wallet: [card],
      offers: [],
      valuations: { points: 2 },
      capReachedCategoriesByCard: { gold: ["dining"] },
    });
    expect(result.winner?.legs[0].baseEarnCents).toBe(200);
    expect(earnedPointsFromEngineLeg(result.winner!.legs[0], 2)).toBe(100);
  });
});
