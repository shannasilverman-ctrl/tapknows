import { describe, expect, it } from "vitest";
import { computeWalletGuide, computeWalletRoles } from "./walletRoles";
import type { CardCatalog, PointsProgram, UserCard, UserOffer } from "./types";

const PROGRAMS: Record<string, PointsProgram> = {
  cashback: { id: "cashback", name: "Cash Back", kind: "cashback", default_cpp: 0.01 },
  ur: { id: "ur", name: "UR", kind: "transferable", default_cpp: 0.02 },
  mr: { id: "mr", name: "MR", kind: "transferable", default_cpp: 0.02 },
};

function mkCard(p: Partial<CardCatalog> & Pick<CardCatalog, "id" | "earn_rules">): CardCatalog {
  return {
    issuer: "Test",
    name: p.id,
    annual_fee: 0,
    points_program_id: "cashback",
    foreign_tx_fee_pct: 0,
    notes: null,
    ...p,
  } as CardCatalog;
}
function mkUc(id: string, cardId: string): UserCard {
  return {
    id,
    user_id: "u",
    card_catalog_id: cardId,
    nickname: null,
    opened_at: null,
    annual_fee_paid_at: null,
    created_at: "",
  };
}
function cat(...cs: CardCatalog[]): Record<string, CardCatalog> {
  const out: Record<string, CardCatalog> = {};
  for (const c of cs) out[c.id] = c;
  return out;
}

describe("walletRoles", () => {
  it("wallet of one card returns only the Everyday role", () => {
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc")],
      catalog: cat(dc),
      programs: PROGRAMS,
    });
    expect(roles.map((r) => r.key)).toEqual(["everyday"]);
    expect(roles[0].userCardId).toBe("u_dc");
  });

  it("all-flat wallet where one card sweeps every domain shows only Everyday", () => {
    // Double Cash 2% flat vs a 1% flat card. DC wins everything; the 1% card
    // never becomes a specialist. No fake grocery/dining/etc roles.
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const one = mkCard({
      id: "one",
      earn_rules: [{ category: "everything_else", multiplier: 0.01 }],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc"), mkUc("u_one", "one")],
      catalog: cat(dc, one),
      programs: PROGRAMS,
    });
    expect(roles.map((r) => r.key)).toEqual(["everyday"]);
  });

  it("assigns clear specialists when they beat the everyday card", () => {
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const bcp = mkCard({
      id: "bcp",
      earn_rules: [
        { category: "groceries", multiplier: 0.06 },
        { category: "everything_else", multiplier: 0.01 },
      ],
    });
    const gold = mkCard({
      id: "gold",
      points_program_id: "mr",
      earn_rules: [
        { category: "dining", multiplier: 4 },
        { category: "groceries", multiplier: 4 },
        { category: "everything_else", multiplier: 1 },
      ],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc"), mkUc("u_bcp", "bcp"), mkUc("u_gold", "gold")],
      catalog: cat(dc, bcp, gold),
      programs: PROGRAMS,
    });
    const byKey = Object.fromEntries(roles.map((r) => [r.key, r]));
    expect(byKey.everyday.cardCatalogId).toBe("dc");
    // Groceries: BCP 6% on $100 = $6 beats Gold 4*$100*2¢ = $8. Gold wins.
    expect(byKey.groceries.cardCatalogId).toBe("gold");
    expect(byKey.dining.cardCatalogId).toBe("gold");
  });

  it("tie on Everyday breaks toward the more frequently used card", () => {
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const twin = mkCard({
      id: "twin",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc"), mkUc("u_twin", "twin")],
      catalog: cat(dc, twin),
      programs: PROGRAMS,
      frecencyByCardId: { u_twin: 10, u_dc: 1 },
    });
    expect(roles[0].userCardId).toBe("u_twin");
  });

  it("online role emerges only when a card actually specializes there (e.g. Amazon 5%)", () => {
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const prime = mkCard({
      id: "prime",
      earn_rules: [
        { category: "amazon", multiplier: 0.05 },
        { category: "everything_else", multiplier: 0.01 },
      ],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc"), mkUc("u_prime", "prime")],
      catalog: cat(dc, prime),
      programs: PROGRAMS,
    });
    const online = roles.find((r) => r.key === "online");
    expect(online?.cardCatalogId).toBe("prime");
  });

  it("uses an active offer only for the wallet job whose merchant it matches", () => {
    const flat = mkCard({
      id: "flat",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const offerCard = mkCard({
      id: "offer",
      earn_rules: [{ category: "everything_else", multiplier: 0.01 }],
    });
    const amazonOffer = {
      id: "amazon-10",
      user_id: "u",
      user_card_id: "u_offer",
      merchant_catalog_id: null,
      merchant_text: "Amazon",
      reward_type: "percent_back",
      reward_value: 10,
      min_spend: 0,
      expires_at: "2099-12-31",
    } satisfies UserOffer;
    const guide = computeWalletGuide({
      userCards: [mkUc("u_flat", "flat"), mkUc("u_offer", "offer")],
      catalog: cat(flat, offerCard),
      programs: PROGRAMS,
      offers: [amazonOffer],
    });

    expect(guide.find((role) => role.key === "online")?.cardCatalogId).toBe("offer");
    expect(guide.find((role) => role.key === "dining")?.cardCatalogId).toBe("flat");
  });

  it("full guide always answers every common spending situation", () => {
    const flat = mkCard({
      id: "flat",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const guide = computeWalletGuide({
      userCards: [mkUc("u_flat", "flat")],
      catalog: cat(flat),
      programs: PROGRAMS,
    });
    expect(guide.map((role) => role.key)).toEqual([
      "everyday",
      "groceries",
      "dining",
      "gas",
      "travel",
      "online",
    ]);
    expect(new Set(guide.map((role) => role.cardCatalogId))).toEqual(new Set(["flat"]));
  });

  it("uses the customer's CPP override when assigning wallet jobs", () => {
    const points = mkCard({
      id: "points",
      points_program_id: "ur",
      earn_rules: [{ category: "everything_else", multiplier: 3 }],
    });
    const cash = mkCard({
      id: "cash",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const input = {
      userCards: [mkUc("u_points", "points"), mkUc("u_cash", "cash")],
      catalog: cat(points, cash),
      programs: PROGRAMS,
    };

    expect(computeWalletGuide(input)[0].cardCatalogId).toBe("points");
    expect(
      computeWalletGuide({
        ...input,
        cppOverrides: { ur: 0.005 },
      })[0].cardCatalogId,
    ).toBe("cash");
  });

  it("changes a category job when the customer marks its bonus cap reached", () => {
    const capped = mkCard({
      id: "capped",
      earn_rules: [
        {
          category: "groceries",
          multiplier: 0.05,
          cap_period_spend: 6_000,
          cap_period: "annual",
          post_cap_multiplier: 0.01,
        },
        { category: "everything_else", multiplier: 0.01 },
      ],
    });
    const flat = mkCard({
      id: "flat",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const input = {
      userCards: [mkUc("u_capped", "capped"), mkUc("u_flat", "flat")],
      catalog: cat(capped, flat),
      programs: PROGRAMS,
    };

    expect(computeWalletGuide(input).find((role) => role.key === "groceries")?.cardCatalogId).toBe(
      "capped",
    );
    expect(
      computeWalletGuide({
        ...input,
        capReachedCategoriesByCard: { u_capped: ["groceries"] },
      }).find((role) => role.key === "groceries")?.cardCatalogId,
    ).toBe("flat");
  });

  it("does not ignore a utilization rerank when assigning a job", () => {
    const rewardsWinner = mkCard({
      id: "winner",
      earn_rules: [{ category: "everything_else", multiplier: 0.05 }],
    });
    const safeCard = mkCard({
      id: "safe",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const input = {
      userCards: [mkUc("u_winner", "winner"), mkUc("u_safe", "safe")],
      catalog: cat(rewardsWinner, safeCard),
      programs: PROGRAMS,
    };

    expect(computeWalletGuide(input)[0].cardCatalogId).toBe("winner");
    const adjusted = computeWalletGuide({
      ...input,
      utilization: {
        enabled: true,
        accountsByUserCardId: {
          u_winner: { limitCents: 100_000, balanceCents: 9_000 },
          u_safe: { limitCents: 100_000, balanceCents: 0 },
        },
        threshold: 0.1,
        behavior: "rerank",
      },
    })[0];
    expect(adjusted.cardCatalogId).toBe("safe");
    expect(adjusted.creditHealth.kind).toBe("reranked");
    expect(adjusted.creditHealth.caution).toContain("Re-ranked to Test safe");
  });

  it("keeps an above-target warning distinct from a changed recommendation", () => {
    const rewardsWinner = mkCard({
      id: "winner",
      earn_rules: [{ category: "everything_else", multiplier: 0.05 }],
    });
    const safeCard = mkCard({
      id: "safe",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const warned = computeWalletGuide({
      userCards: [mkUc("u_winner", "winner"), mkUc("u_safe", "safe")],
      catalog: cat(rewardsWinner, safeCard),
      programs: PROGRAMS,
      utilization: {
        enabled: true,
        accountsByUserCardId: {
          u_winner: { limitCents: 100_000, balanceCents: 9_000 },
          u_safe: { limitCents: 100_000, balanceCents: 0 },
        },
        threshold: 0.1,
        behavior: "warn",
      },
    })[0];

    expect(warned.cardCatalogId).toBe("winner");
    expect(warned.creditHealth.kind).toBe("warning");
    expect(warned.creditHealth.caution).toContain("14% utilization");
    expect(warned.creditHealth.caution).toContain("above your 10% target");
  });

  it("preserves the useful amounts and cards in a split suggestion", () => {
    const rewardsWinner = mkCard({
      id: "winner",
      earn_rules: [{ category: "everything_else", multiplier: 0.05 }],
    });
    const safeCard = mkCard({
      id: "safe",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const split = computeWalletGuide({
      userCards: [mkUc("u_winner", "winner"), mkUc("u_safe", "safe")],
      catalog: cat(rewardsWinner, safeCard),
      programs: PROGRAMS,
      utilization: {
        enabled: true,
        accountsByUserCardId: {
          u_winner: { limitCents: 100_000, balanceCents: 9_000 },
          u_safe: { limitCents: 100_000, balanceCents: 0 },
        },
        threshold: 0.1,
        behavior: "split",
      },
    })[0];

    expect(split.cardCatalogId).toBe("winner");
    expect(split.creditHealth.kind).toBe("split-suggested");
    expect(split.creditHealth.caution).toContain("$10 on Test winner");
    expect(split.creditHealth.caution).toContain("$40 on Test safe");
  });

  it("labels close calls instead of overstating a tiny edge", () => {
    const twoPercent = mkCard({
      id: "two",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const nearTie = mkCard({
      id: "near",
      earn_rules: [{ category: "everything_else", multiplier: 0.019 }],
    });
    const everyday = computeWalletGuide({
      userCards: [mkUc("u_two", "two"), mkUc("u_near", "near")],
      catalog: cat(twoPercent, nearTie),
      programs: PROGRAMS,
    })[0];

    expect(everyday.comparisonLabel).toBe("Close call");
  });
});
