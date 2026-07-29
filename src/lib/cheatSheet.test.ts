import { describe, expect, it } from "vitest";
import { buildCheatSheetPicks } from "./cheatSheet";
import { recommend, type EngineCard } from "./recommendationEngine";

const pointsCard: EngineCard = {
  id: "points",
  card_catalog_id: "points_catalog",
  nickname: "Dinner card",
  issuer: "Example",
  name: "Points",
  points_program_id: "points",
  foreign_tx_fee_pct: 0,
  earn_rules: [
    { category: "dining", multiplier: 4 },
    { category: "everything_else", multiplier: 1 },
  ],
};

const customCashCard: EngineCard = {
  id: "custom",
  card_catalog_id: "custom_catalog_row",
  issuer: "My Credit Union",
  name: "Custom Cash",
  points_program_id: "cashback",
  foreign_tx_fee_pct: 0,
  earn_rules: [
    {
      category: "dining",
      multiplier: 0.05,
      cap_period_spend: 500,
      cap_period: "monthly",
      post_cap_multiplier: 0.01,
    },
    { category: "everything_else", multiplier: 0.02 },
  ],
};

describe("buildCheatSheetPicks", () => {
  it("uses the canonical engine winner for every row", () => {
    const wallet = [pointsCard, customCashCard];
    const valuations = { points: 2, cashback: 1 };
    const dining = buildCheatSheetPicks({ wallet, offers: [], valuations }).find(
      (pick) => pick.categoryId === "dining",
    );
    const canonical = recommend({
      amountCents: 10_000,
      category: "dining",
      wallet,
      offers: [],
      valuations,
    }).winner;

    expect(dining?.cards[0].id).toBe(canonical?.legs[0].userCardId);
  });

  it("honors personal point values and retains custom catalog cards", () => {
    const wallet = [pointsCard, customCashCard];
    const lowPointValue = buildCheatSheetPicks({
      wallet,
      offers: [],
      valuations: { points: 0.5, cashback: 1 },
    }).find((pick) => pick.categoryId === "dining");

    expect(lowPointValue?.cards[0].card_catalog_id).toBe("custom_catalog_row");
    expect(lowPointValue?.cardLabel).toContain("Custom Cash");
  });

  it("honors a user's cap-reached state", () => {
    const dining = buildCheatSheetPicks({
      wallet: [pointsCard, customCashCard],
      offers: [],
      valuations: { points: 1, cashback: 1 },
      capReachedCategoriesByCard: { custom: ["dining"] },
    }).find((pick) => pick.categoryId === "dining");

    expect(dining?.cards[0].id).toBe("points");
  });

  it("shows the post-cap rate when a capped card still wins", () => {
    const postCapWinner: EngineCard = {
      ...customCashCard,
      earn_rules: [
        {
          category: "dining",
          multiplier: 0.05,
          cap_period_spend: 500,
          cap_period: "monthly",
          post_cap_multiplier: 0.03,
        },
        { category: "everything_else", multiplier: 0.02 },
      ],
    };
    const dining = buildCheatSheetPicks({
      wallet: [pointsCard, postCapWinner],
      offers: [],
      valuations: { points: 0.5, cashback: 1 },
      capReachedCategoriesByCard: { custom: ["dining"] },
    }).find((pick) => pick.categoryId === "dining");

    expect(dining?.cards[0].id).toBe("custom");
    expect(dining?.rateLabel).toBe("3% back");
    expect(dining?.exception).toContain("post-cap rate");
  });

  it("matches Plan's utilization rerank when credit-health protection is enabled", () => {
    const dining = buildCheatSheetPicks({
      wallet: [pointsCard, customCashCard],
      offers: [],
      valuations: { points: 2, cashback: 1 },
      utilization: {
        enabled: true,
        accountsByUserCardId: {
          points: { limitCents: 100_000, balanceCents: 9_000 },
          custom: { limitCents: 100_000, balanceCents: 0 },
        },
        threshold: 0.1,
        behavior: "rerank",
      },
    }).find((pick) => pick.categoryId === "dining");

    expect(dining?.cards[0].id).toBe("custom");
    expect(dining?.exception).toContain("re-ranked");
  });

  it("keeps utilization warnings visible in the one-glance row", () => {
    const dining = buildCheatSheetPicks({
      wallet: [pointsCard, customCashCard],
      offers: [],
      valuations: { points: 2, cashback: 1 },
      utilization: {
        enabled: true,
        accountsByUserCardId: {
          points: { limitCents: 100_000, balanceCents: 9_000 },
        },
        threshold: 0.1,
        behavior: "warn",
      },
    }).find((pick) => pick.categoryId === "dining");

    expect(dining?.cards[0].id).toBe("points");
    expect(dining?.exception).toContain("above your comfort level");
  });

  it("keeps split suggestions visible in the one-glance row", () => {
    const dining = buildCheatSheetPicks({
      wallet: [pointsCard, customCashCard],
      offers: [],
      valuations: { points: 2, cashback: 1 },
      utilization: {
        enabled: true,
        accountsByUserCardId: {
          points: { limitCents: 100_000, balanceCents: 9_000 },
          custom: { limitCents: 100_000, balanceCents: 0 },
        },
        threshold: 0.1,
        behavior: "split",
      },
    }).find((pick) => pick.categoryId === "dining");

    expect(dining?.exception).toContain("consider splitting");
  });
});
