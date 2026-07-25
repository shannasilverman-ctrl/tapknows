// Engine hardening test suite for the recommendation planner + benefits math.
// Focus: arbitration logic and failure modes. UI is out of scope.
import { describe, expect, it } from "vitest";
import {
  planPurchase,
  buildMathRows,
  type PlannerInput,
  type PlannerBenefitContext,
} from "./planner";
import type { CardCatalog, PointsProgram, UserCard, UserOffer } from "./types";
import type { CardBenefit } from "./benefits";
import { currentPeriod, previousPeriodKey, benefitMatches } from "./benefits";

// ---------- fixtures ----------

const PROGRAMS: Record<string, PointsProgram> = {
  cashback: { id: "cashback", name: "Cash Back", kind: "cashback", default_cpp: 0.01 },
  ur: { id: "ur", name: "UR", kind: "transferable", default_cpp: 0.02 },
  mr: { id: "mr", name: "MR", kind: "transferable", default_cpp: 0.02 },
  fixed_low: { id: "fixed_low", name: "Fixed", kind: "fixed", default_cpp: 0.015 },
};

function catalog(...cs: CardCatalog[]): Record<string, CardCatalog> {
  const out: Record<string, CardCatalog> = {};
  for (const c of cs) out[c.id] = c;
  return out;
}
function mkCard(
  overrides: Partial<CardCatalog> & Pick<CardCatalog, "id" | "earn_rules">,
): CardCatalog {
  return {
    issuer: "Test",
    name: "Card",
    annual_fee: 0,
    points_program_id: "cashback",
    foreign_tx_fee_pct: 0,
    notes: null,
    ...overrides,
  } as CardCatalog;
}
function mkUc(id: string, cardId: string, nickname: string | null = null): UserCard {
  return {
    id,
    user_id: "u",
    card_catalog_id: cardId,
    nickname,
    opened_at: null,
    annual_fee_paid_at: null,
    created_at: "",
  };
}
function baseInput(
  partial: Partial<PlannerInput> &
    Pick<PlannerInput, "userCards" | "catalog" | "amountCents" | "merchantCategory">,
): PlannerInput {
  return {
    programs: PROGRAMS,
    offers: [],
    cppOverrides: {},
    ...partial,
  };
}

// ---------- core math ----------

describe("core math", () => {
  it("cashback 2% on $100 = $2.00", () => {
    const c = mkCard({ id: "dc", earn_rules: [{ category: "all", multiplier: 0.02 }] });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "dc")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "groceries",
      }),
    );
    expect(plays[0].totalValueCents).toBe(200);
  });

  it("points 3x on $100 at 1.5cpp = $4.50", () => {
    const c = mkCard({
      id: "p",
      points_program_id: "ur",
      earn_rules: [{ category: "all", multiplier: 3 }],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "p")],
        catalog: catalog(c),
        cppOverrides: { ur: 0.015 },
        amountCents: 10000,
        merchantCategory: "all",
      }),
    );
    expect(plays[0].totalValueCents).toBe(450);
  });

  it("rounds at odd amounts without drift", () => {
    const c = mkCard({ id: "dc", earn_rules: [{ category: "all", multiplier: 0.02 }] });
    // $33.33 × 2% = $0.6666 → 67¢
    const p1 = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "dc")],
        catalog: catalog(c),
        amountCents: 3333,
        merchantCategory: "all",
      }),
    );
    expect(p1[0].totalValueCents).toBe(67);
    // $0.01 × 2% = $0.0002 → 0¢
    const p2 = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "dc")],
        catalog: catalog(c),
        amountCents: 1,
        merchantCategory: "all",
      }),
    );
    expect(p2[0].totalValueCents).toBe(0);
    // $99999.99 × 2% = $1999.9998 → $2000.00 (200000¢)
    const p3 = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "dc")],
        catalog: catalog(c),
        amountCents: 9999999,
        merchantCategory: "all",
      }),
    );
    expect(p3[0].totalValueCents).toBe(200000);
  });

  it("direct category beats base 'all' rule", () => {
    const c = mkCard({
      id: "g",
      points_program_id: "cashback",
      earn_rules: [
        { category: "groceries", multiplier: 0.05 },
        { category: "all", multiplier: 0.01 },
      ],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "g")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "groceries",
      }),
    );
    expect(plays[0].totalValueCents).toBe(500);
  });

  it("unknown category falls back to base 'all' rule", () => {
    const c = mkCard({
      id: "g",
      earn_rules: [
        { category: "groceries", multiplier: 0.05 },
        { category: "all", multiplier: 0.01 },
      ],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "g")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "unrecognized_xyz",
      }),
    );
    expect(plays[0].totalValueCents).toBe(100);
  });

  it("card with no 'all' rule still resolves (default 1x)", () => {
    const c = mkCard({
      id: "narrow",
      points_program_id: "ur",
      earn_rules: [{ category: "dining", multiplier: 3 }],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "narrow")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "gas",
      }),
    );
    // Falls back to synthetic {all, 1x}, ur@2¢ → $100 * 1 * 0.02 = $2 = 200¢
    expect(plays[0].totalValueCents).toBe(200);
  });

  it("cpp override beats program default", () => {
    const c = mkCard({
      id: "u",
      points_program_id: "ur",
      earn_rules: [{ category: "all", multiplier: 1 }],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "u")],
        catalog: catalog(c),
        cppOverrides: { ur: 0.03 },
        amountCents: 10000,
        merchantCategory: "all",
      }),
    );
    // 100pts × 3¢ = 300¢
    expect(plays[0].totalValueCents).toBe(300);
  });

  it("null program falls back to 1.0 cpp", () => {
    const c = mkCard({
      id: "n",
      points_program_id: null,
      earn_rules: [{ category: "all", multiplier: 1 }],
    });
    // 100 points * 100¢ = 10000¢
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "n")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "all",
      }),
    );
    expect(plays[0].totalValueCents).toBe(10000);
  });

  it("known program with no override uses default_cpp", () => {
    const c = mkCard({
      id: "m",
      points_program_id: "mr",
      earn_rules: [{ category: "all", multiplier: 4 }],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "m")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "all",
      }),
    );
    expect(plays[0].totalValueCents).toBe(800);
  });
});

// ---------- foreign transactions ----------

describe("foreign transactions", () => {
  it("subtracts fee correctly", () => {
    const c = mkCard({
      id: "fx",
      points_program_id: "cashback",
      foreign_tx_fee_pct: 0.03,
      earn_rules: [{ category: "all", multiplier: 0.02 }],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "fx")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "all",
        foreign: true,
      }),
    );
    // 200¢ earn - 300¢ fee = -100¢
    expect(plays[0].totalValueCents).toBe(-100);
  });

  it("0% fee card unaffected abroad", () => {
    const c = mkCard({
      id: "nofee",
      foreign_tx_fee_pct: 0,
      earn_rules: [{ category: "all", multiplier: 0.02 }],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "nofee")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "all",
        foreign: true,
      }),
    );
    expect(plays[0].totalValueCents).toBe(200);
  });

  it("foreign fee flips the winner", () => {
    const highEarnFee = mkCard({
      id: "hef",
      foreign_tx_fee_pct: 0.03,
      earn_rules: [{ category: "all", multiplier: 0.03 }],
    });
    const lowerEarnNoFee = mkCard({
      id: "cln",
      foreign_tx_fee_pct: 0,
      earn_rules: [{ category: "all", multiplier: 0.02 }],
    });
    const domestic = planPurchase(
      baseInput({
        userCards: [mkUc("a", "hef"), mkUc("b", "cln")],
        catalog: catalog(highEarnFee, lowerEarnNoFee),
        amountCents: 10000,
        merchantCategory: "all",
      }),
    );
    expect(domestic[0].legs[0].userCardId).toBe("a");
    const abroad = planPurchase(
      baseInput({
        userCards: [mkUc("a", "hef"), mkUc("b", "cln")],
        catalog: catalog(highEarnFee, lowerEarnNoFee),
        amountCents: 10000,
        merchantCategory: "all",
        foreign: true,
      }),
    );
    expect(abroad[0].legs[0].userCardId).toBe("b");
  });

  it("sort still orders negative-value plays correctly", () => {
    const bad = mkCard({
      id: "bad",
      foreign_tx_fee_pct: 0.05,
      earn_rules: [{ category: "all", multiplier: 0.01 }],
    });
    const worse = mkCard({
      id: "worse",
      foreign_tx_fee_pct: 0.1,
      earn_rules: [{ category: "all", multiplier: 0.01 }],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("a", "bad"), mkUc("b", "worse")],
        catalog: catalog(bad, worse),
        amountCents: 10000,
        merchantCategory: "all",
        foreign: true,
      }),
    );
    expect(plays[0].totalValueCents).toBeGreaterThan(plays[1].totalValueCents);
  });
});

// ---------- offers ----------

const CARD_A = mkCard({
  id: "a",
  points_program_id: "cashback",
  earn_rules: [{ category: "all", multiplier: 0.02 }],
});
const CARD_B = mkCard({
  id: "b",
  points_program_id: "cashback",
  earn_rules: [{ category: "all", multiplier: 0.015 }],
});

function mkOffer(
  o: Partial<UserOffer> & Pick<UserOffer, "user_card_id" | "reward_type" | "reward_value">,
): UserOffer {
  return {
    id: "off1",
    user_id: "u",
    merchant_catalog_id: null,
    merchant_text: "TestCo",
    min_spend: 0,
    expires_at: null,
    ...o,
  };
}

describe("offers", () => {
  it("statement_credit stacks on top of base earn", () => {
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("uA", "a")],
        catalog: catalog(CARD_A),
        amountCents: 10000,
        merchantCategory: "all",
        offers: [
          mkOffer({
            user_card_id: "uA",
            reward_type: "statement_credit",
            reward_value: 20,
            min_spend: 0,
          }),
        ],
      }),
    );
    // base 200¢ + $20 credit = 2200¢
    expect(plays[0].totalValueCents).toBe(2200);
  });

  it("percent_back replaces base only when larger (max)", () => {
    // 3% offer replaces 2% base
    const p1 = planPurchase(
      baseInput({
        userCards: [mkUc("uA", "a")],
        catalog: catalog(CARD_A),
        amountCents: 10000,
        merchantCategory: "all",
        offers: [mkOffer({ user_card_id: "uA", reward_type: "percent_back", reward_value: 3 })],
      }),
    );
    expect(p1[0].totalValueCents).toBe(300);
    // 1% offer worse than 2% base — base wins
    const p2 = planPurchase(
      baseInput({
        userCards: [mkUc("uA", "a")],
        catalog: catalog(CARD_A),
        amountCents: 10000,
        merchantCategory: "all",
        offers: [mkOffer({ user_card_id: "uA", reward_type: "percent_back", reward_value: 1 })],
      }),
    );
    expect(p2[0].totalValueCents).toBe(200);
  });

  it("multiplier offer replaces base only when larger", () => {
    // points card: base 1x at 2¢ = 200¢, offer 5x at 2¢ = 1000¢
    const c = mkCard({
      id: "p",
      points_program_id: "ur",
      earn_rules: [{ category: "all", multiplier: 1 }],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("uP", "p")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "all",
        offers: [mkOffer({ user_card_id: "uP", reward_type: "multiplier", reward_value: 5 })],
      }),
    );
    expect(plays[0].totalValueCents).toBe(1000);
  });

  it("offer with min_spend above amount does NOT apply on single play", () => {
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("uA", "a")],
        catalog: catalog(CARD_A),
        amountCents: 5000,
        merchantCategory: "all",
        offers: [
          mkOffer({
            user_card_id: "uA",
            reward_type: "statement_credit",
            reward_value: 20,
            min_spend: 100,
          }),
        ],
      }),
    );
    // base only, no credit
    expect(plays[0].totalValueCents).toBe(100);
    expect(plays[0].legs[0].offerApplied).toBeUndefined();
  });
});

// ---------- split plays ----------

describe("split plays", () => {
  it("only generated when min_spend < amount", () => {
    // min_spend equals amount → no split
    const p1 = planPurchase(
      baseInput({
        userCards: [mkUc("uA", "a"), mkUc("uB", "b")],
        catalog: catalog(CARD_A, CARD_B),
        amountCents: 10000,
        merchantCategory: "all",
        offers: [
          mkOffer({
            user_card_id: "uA",
            reward_type: "statement_credit",
            reward_value: 20,
            min_spend: 100,
          }),
        ],
      }),
    );
    expect(p1.every((p) => p.kind === "single")).toBe(true);
  });

  it("legA exactly min_spend, legB the remainder", () => {
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("uA", "a"), mkUc("uB", "b")],
        catalog: catalog(CARD_A, CARD_B),
        amountCents: 20000,
        merchantCategory: "all",
        offers: [
          mkOffer({
            user_card_id: "uA",
            reward_type: "statement_credit",
            reward_value: 20,
            min_spend: 100,
          }),
        ],
      }),
    );
    const split = plays.find((p) => p.kind === "split");
    expect(split).toBeDefined();
    expect(split!.legs[0].amountCents).toBe(10000);
    expect(split!.legs[1].amountCents).toBe(10000);
    expect(split!.legs[0].userCardId).not.toBe(split!.legs[1].userCardId);
    expect(split!.legs[0].amountCents + split!.legs[1].amountCents).toBe(20000);
    expect(split!.totalValueCents).toBe(split!.legs[0].valueCents + split!.legs[1].valueCents);
  });
});

// ---------- benefits ----------

function mkBenefit(
  o: Partial<CardBenefit> & Pick<CardBenefit, "id" | "card_catalog_id">,
): CardBenefit {
  return {
    label: "$25 monthly credit",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 2500,
    categories: ["dining"],
    source: "https://example.com",
    ...o,
  };
}
function ctxRow(b: CardBenefit, remaining_cents = b.value_cents ?? 0): PlannerBenefitContext {
  return { benefit: b, remaining_cents, ends_at: new Date("2026-07-31") };
}

describe("benefits", () => {
  const c = mkCard({
    id: "din",
    points_program_id: "cashback",
    earn_rules: [
      { category: "dining", multiplier: 0.03 },
      { category: "all", multiplier: 0.01 },
    ],
  });

  it("credit capped at min(remaining, purchase): $25 remaining, $100 buy applies $25", () => {
    const b = mkBenefit({ id: "b1", card_catalog_id: "din" });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "din")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "dining",
        benefitsByCard: { din: [ctxRow(b, 2500)] },
      }),
    );
    // rewards $3 + credit $25 = $28
    expect(plays[0].totalValueCents).toBe(2800);
    expect(plays[0].legs[0].benefitApplied?.applied_cents).toBe(2500);
  });

  it("credit capped by purchase: $200 remaining on $50 buy applies $50", () => {
    const b = mkBenefit({
      id: "b1",
      card_catalog_id: "din",
      value_cents: 20000,
      label: "big credit",
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "din")],
        catalog: catalog(c),
        amountCents: 5000,
        merchantCategory: "dining",
        benefitsByCard: { din: [ctxRow(b, 20000)] },
      }),
    );
    // rewards 150¢ + 5000¢ credit
    expect(plays[0].legs[0].benefitApplied?.applied_cents).toBe(5000);
    expect(plays[0].totalValueCents).toBe(150 + 5000);
  });

  it("zero remaining applies nothing", () => {
    const b = mkBenefit({ id: "b1", card_catalog_id: "din" });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "din")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "dining",
        benefitsByCard: { din: [ctxRow(b, 0)] },
      }),
    );
    expect(plays[0].legs[0].benefitApplied).toBeUndefined();
    expect(plays[0].totalValueCents).toBe(300);
  });

  it("standing benefits (value_cents null) never enter money math", () => {
    const b: CardBenefit = {
      id: "std",
      card_catalog_id: "din",
      label: "Trip delay",
      kind: "standing",
      cadence: "annual",
      value_cents: null,
      categories: ["dining"],
      source: "x",
    };
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "din")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "dining",
        benefitsByCard: { din: [{ benefit: b, remaining_cents: 99999, ends_at: new Date() }] },
      }),
    );
    expect(plays[0].legs[0].benefitApplied).toBeUndefined();
    expect(plays[0].totalValueCents).toBe(300);
  });

  it("benefit must match merchant/category to apply", () => {
    const b = mkBenefit({ id: "b1", card_catalog_id: "din", categories: ["gas"] });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "din")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "dining",
        benefitsByCard: { din: [ctxRow(b)] },
      }),
    );
    expect(plays[0].legs[0].benefitApplied).toBeUndefined();
  });

  it("largest applicable benefit wins when multiple match", () => {
    const small = mkBenefit({ id: "s", card_catalog_id: "din", value_cents: 1000, label: "small" });
    const big = mkBenefit({ id: "big", card_catalog_id: "din", value_cents: 4000, label: "big" });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "din")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "dining",
        benefitsByCard: { din: [ctxRow(small), ctxRow(big)] },
      }),
    );
    expect(plays[0].legs[0].benefitApplied?.benefit_id).toBe("big");
    expect(plays[0].legs[0].benefitApplied?.applied_cents).toBe(4000);
  });

  it("reason names rewards and credit separately", () => {
    const b = mkBenefit({ id: "b1", card_catalog_id: "din", label: "$25 monthly Dining credit" });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "din")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "dining",
        benefitsByCard: { din: [ctxRow(b, 2500)] },
      }),
    );
    const r = plays[0].legs[0].reasoning;
    expect(r).toMatch(/on dining/); // rewards part
    expect(r).toMatch(/\$25/); // credit part
    expect(r).toMatch(/resets/);
  });

  it("reason never claims a credit that was not applied", () => {
    const b = mkBenefit({ id: "b1", card_catalog_id: "din" });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "din")],
        catalog: catalog(c),
        amountCents: 10000,
        merchantCategory: "dining",
        benefitsByCard: { din: [ctxRow(b, 0)] },
      }),
    );
    expect(plays[0].legs[0].reasoning).not.toMatch(/credit|resets/);
  });
});

// ---------- ranking invariants ----------

describe("ranking invariants", () => {
  it("top play >= every other play", () => {
    // pseudo-random small wallets
    const rand = mulberry32(42);
    for (let i = 0; i < 25; i++) {
      const cards: CardCatalog[] = [];
      const ucs: UserCard[] = [];
      const n = 2 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const isCashback = rand() > 0.5;
        cards.push(
          mkCard({
            id: `c${k}`,
            points_program_id: isCashback ? "cashback" : "ur",
            foreign_tx_fee_pct: rand() > 0.7 ? 0.03 : 0,
            earn_rules: [
              { category: "all", multiplier: isCashback ? 0.01 + rand() * 0.05 : 1 + rand() * 4 },
            ],
          }),
        );
        ucs.push(mkUc(`u${k}`, `c${k}`));
      }
      const plays = planPurchase(
        baseInput({
          userCards: ucs,
          catalog: catalog(...cards),
          amountCents: 100 + Math.floor(rand() * 200000),
          merchantCategory: "all",
          foreign: rand() > 0.5,
        }),
      );
      for (let j = 1; j < plays.length; j++) {
        expect(plays[0].totalValueCents).toBeGreaterThanOrEqual(plays[j].totalValueCents);
      }
    }
  });

  it("no play has negative applied credit; no leg exceeds purchase; split legs sum to purchase", () => {
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("uA", "a"), mkUc("uB", "b")],
        catalog: catalog(CARD_A, CARD_B),
        amountCents: 20000,
        merchantCategory: "all",
        offers: [
          mkOffer({
            user_card_id: "uA",
            reward_type: "statement_credit",
            reward_value: 20,
            min_spend: 100,
          }),
        ],
      }),
    );
    for (const p of plays) {
      for (const l of p.legs) {
        expect(l.amountCents).toBeLessThanOrEqual(20000);
        expect(l.benefitApplied?.applied_cents ?? 0).toBeGreaterThanOrEqual(0);
      }
      if (p.kind === "split") {
        expect(p.legs.reduce((s, l) => s + l.amountCents, 0)).toBe(20000);
      }
    }
  });

  it("empty wallet returns []", () => {
    expect(
      planPurchase(
        baseInput({ userCards: [], catalog: {}, amountCents: 10000, merchantCategory: "all" }),
      ),
    ).toEqual([]);
  });

  it("zero or negative amount returns []", () => {
    expect(
      planPurchase(
        baseInput({
          userCards: [mkUc("u1", "a")],
          catalog: catalog(CARD_A),
          amountCents: 0,
          merchantCategory: "all",
        }),
      ),
    ).toEqual([]);
    expect(
      planPurchase(
        baseInput({
          userCards: [mkUc("u1", "a")],
          catalog: catalog(CARD_A),
          amountCents: -500,
          merchantCategory: "all",
        }),
      ),
    ).toEqual([]);
  });

  it("wallet with one card returns exactly one single play", () => {
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "a")],
        catalog: catalog(CARD_A),
        amountCents: 10000,
        merchantCategory: "all",
      }),
    );
    expect(plays).toHaveLength(1);
    expect(plays[0].kind).toBe("single");
  });
});

// ---------- buildMathRows ----------

describe("buildMathRows", () => {
  it("earn description matches leg math; redemption is cash for cashback and cpp for points; net = total", () => {
    const cash = mkCard({
      id: "a",
      points_program_id: "cashback",
      earn_rules: [{ category: "all", multiplier: 0.02 }],
    });
    const pts = mkCard({
      id: "p",
      points_program_id: "ur",
      earn_rules: [{ category: "all", multiplier: 3 }],
    });
    const plays = planPurchase(
      baseInput({
        userCards: [mkUc("u1", "a"), mkUc("u2", "p")],
        catalog: catalog(cash, pts),
        amountCents: 10000,
        merchantCategory: "all",
      }),
    );
    const rows = buildMathRows(plays, PROGRAMS, {});
    const rCash = rows.find((r) => r.playId === "single_u1")!;
    const rPts = rows.find((r) => r.playId === "single_u2")!;
    expect(rCash.earnDescription).toContain("2%");
    expect(rCash.redemptionDescription).toBe("cash");
    expect(rPts.earnDescription).toContain("3x");
    expect(rPts.redemptionDescription).toContain("UR");
    expect(rPts.redemptionDescription).toContain("2.00¢");
    for (const p of plays) {
      const r = rows.find((x) => x.playId === p.id)!;
      expect(r.netValueCents).toBe(p.totalValueCents);
    }
  });
});

// ---------- period math ----------

describe("period math", () => {
  it("currentPeriod month/quarter/semiannual/annual keys and end-of-period", () => {
    const feb = new Date(Date.UTC(2026, 1, 15));
    expect(currentPeriod("monthly", feb).key).toBe("2026-02");
    expect(currentPeriod("monthly", feb).endsAt.getUTCDate()).toBe(28);
    expect(currentPeriod("quarterly", feb).key).toBe("2026-Q1");
    expect(currentPeriod("semiannual", feb).key).toBe("2026-H1");
    expect(currentPeriod("annual", feb).key).toBe("2026");
    expect(currentPeriod("annual", feb).endsAt.getUTCMonth()).toBe(11);
    expect(currentPeriod("annual", feb).endsAt.getUTCDate()).toBe(31);

    const jul = new Date(Date.UTC(2026, 6, 1));
    expect(currentPeriod("quarterly", jul).key).toBe("2026-Q3");
    expect(currentPeriod("semiannual", jul).key).toBe("2026-H2");
  });

  it("previousPeriodKey rolls back correctly", () => {
    const feb = new Date(Date.UTC(2026, 1, 15));
    expect(previousPeriodKey("monthly", feb)).toBe("2026-01");
    expect(previousPeriodKey("quarterly", feb)).toBe("2025-Q4");
    expect(previousPeriodKey("semiannual", feb)).toBe("2025-H2");
    expect(previousPeriodKey("annual", feb)).toBe("2025");
  });
});

// ---------- benefitMatches ----------

describe("benefitMatches", () => {
  const dining: CardBenefit = {
    id: "d",
    card_catalog_id: "x",
    label: "l",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 100,
    categories: ["dining"],
    source: "s",
  };
  const uber: CardBenefit = {
    id: "u",
    card_catalog_id: "x",
    label: "l",
    kind: "redeemable",
    cadence: "monthly",
    value_cents: 100,
    merchants: ["uber"],
    source: "s",
  };

  it("matches by category", () => {
    expect(benefitMatches(dining, null, "dining")).toBe(true);
    expect(benefitMatches(dining, null, "gas")).toBe(false);
  });
  it("matches by merchant name substring", () => {
    expect(benefitMatches(uber, { name: "Uber Eats" }, "any")).toBe(true);
    expect(benefitMatches(uber, { name: "Doordash" }, "any")).toBe(false);
  });
  it("no merchants and non-matching category returns false", () => {
    expect(benefitMatches(dining, { name: "Anything" }, "gas")).toBe(false);
  });
});

// ---------- helpers ----------

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
