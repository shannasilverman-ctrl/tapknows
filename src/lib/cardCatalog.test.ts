import { describe, expect, it } from "vitest";
import { recommend, type EngineCard, type EngineInput } from "./recommendationEngine";
import { CARD_CATALOG, CATALOG_BY_ID, RATES_VERIFIED_ON } from "./cardCatalog";
import { POINT_VALUATIONS, defaultCpp } from "./pointValuations";
import { planPurchase } from "./planner";
import type { CardCatalog, PointsProgram, UserCard, UserOffer } from "./types";

// -- Adapter: catalog card (dollars-per-point in valuations table) into EngineCard.
// The engine uses CENTS-per-point. Convert POINT_VALUATIONS (dollars/pt) accordingly.
const ENGINE_VALUATIONS: Record<string, number> = Object.fromEntries(
  Object.entries(POINT_VALUATIONS).map(([k, v]) => [k, v.cpp * 100]),
);

function engineCardFromCatalog(id: string): EngineCard {
  const c = CATALOG_BY_ID[id];
  if (!c) throw new Error(`missing catalog card ${id}`);
  return {
    id: `u_${id}`,
    card_catalog_id: c.id,
    issuer: c.issuer,
    name: c.name,
    points_program_id: c.points_program_id,
    foreign_tx_fee_pct: c.foreign_tx_fee_pct,
    earn_rules: c.earn_rules.map((r) => ({
      category: r.category,
      multiplier: r.multiplier,
      cap_period_spend: r.cap_period_spend,
      cap_period: r.cap_period,
    })),
  };
}

describe("catalog integrity", () => {
  it("has exactly 25 cards, all stamped with the verified date", () => {
    expect(CARD_CATALOG).toHaveLength(25);
    for (const c of CARD_CATALOG) {
      expect(c.rates_verified_on).toBe(RATES_VERIFIED_ON);
      expect(c.source).toMatch(/^https?:\/\//);
      expect(c.earn_rules.some((r) => r.category === "everything_else")).toBe(true);
    }
  });

  it("every card's points program has a documented valuation", () => {
    for (const c of CARD_CATALOG) {
      expect(
        POINT_VALUATIONS[c.points_program_id],
        `missing valuation for ${c.points_program_id}`,
      ).toBeTruthy();
    }
  });

  it("valuation basis records include a source label", () => {
    for (const [id, v] of Object.entries(POINT_VALUATIONS)) {
      expect(v.programId).toBe(id);
      expect(v.cpp).toBeGreaterThan(0);
      expect(v.sourceLabel.length).toBeGreaterThan(0);
    }
  });

  it("known program valuations match published defaults", () => {
    expect(defaultCpp("cashback")).toBe(0.01);
    expect(defaultCpp("amex_mr")).toBe(0.02);
    expect(defaultCpp("chase_ur")).toBeCloseTo(0.0205, 4);
    expect(defaultCpp("hyatt_wob")).toBeCloseTo(0.016, 4);
    expect(defaultCpp("bilt")).toBeCloseTo(0.022, 4);
  });

  it("keeps the current Sapphire Preferred gas category in the verified catalog", () => {
    expect(CATALOG_BY_ID.chase_csp.earn_rules).toContainEqual(
      expect.objectContaining({ category: "gas", multiplier: 3 }),
    );
  });
});

describe("engine — category cap pro-rate", () => {
  it("Blue Cash Preferred 6% groceries caps at $6k/yr, pro-rates the overage at 1%", () => {
    const bcp = engineCardFromCatalog("amex_blue_cash_preferred");
    // With $5,900 already spent YTD on groceries and a $500 purchase:
    // $100 at 6% ($6) + $400 at 1% ($4) = $10.00 = 1000¢
    const out = recommend({
      amountCents: 50000,
      category: "groceries",
      wallet: [bcp],
      offers: [],
      valuations: ENGINE_VALUATIONS,
      categorySpendYtdByCard: { [bcp.id]: 5900 },
    });
    expect(out.winner?.totalValueCents).toBe(1000);
  });

  it("fully within cap: capped rate applies to the whole purchase", () => {
    const bcp = engineCardFromCatalog("amex_blue_cash_preferred");
    // $100 grocery run, no YTD spend: 100 * 6% = 600¢
    const out = recommend({
      amountCents: 10000,
      category: "groceries",
      wallet: [bcp],
      offers: [],
      valuations: ENGINE_VALUATIONS,
      categorySpendYtdByCard: { [bcp.id]: 0 },
    });
    expect(out.winner?.totalValueCents).toBe(600);
  });

  it("beyond cap: entire purchase earns fallback rate", () => {
    const bcp = engineCardFromCatalog("amex_blue_cash_preferred");
    // Cap already fully consumed; $200 grocery at 1% = 200¢
    const out = recommend({
      amountCents: 20000,
      category: "groceries",
      wallet: [bcp],
      offers: [],
      valuations: ENGINE_VALUATIONS,
      categorySpendYtdByCard: { [bcp.id]: 6000 },
    });
    expect(out.winner?.totalValueCents).toBe(200);
  });

  it("Amex Gold groceries: 4x with cap at $25k/yr pro-rates", () => {
    const gold = engineCardFromCatalog("amex_gold");
    // $500 grocery purchase, $24,800 YTD → $200 at 4x MR (0.02 cpp = 2¢) + $300 at 1x
    // = 200*4*2 = 1600¢, plus 300*1*2 = 600¢, total 2200¢ = $22.00.
    const out = recommend({
      amountCents: 50000,
      category: "groceries",
      wallet: [gold],
      offers: [],
      valuations: ENGINE_VALUATIONS,
      categorySpendYtdByCard: { [gold.id]: 24800 },
    });
    expect(out.winner?.totalValueCents).toBe(2200);
  });
});

describe("engine — universal-match categories", () => {
  it("Citi Custom Cash top_category earns 5% on any category up to the cap", () => {
    const cc = engineCardFromCatalog("citi_custom_cash");
    // $400 dining purchase, no YTD: cap is $500 monthly, so full 5% = 2000¢
    const out = recommend({
      amountCents: 40000,
      category: "dining",
      wallet: [cc],
      offers: [],
      valuations: ENGINE_VALUATIONS,
      categorySpendYtdByCard: { [cc.id]: 0 },
    });
    expect(out.winner?.totalValueCents).toBe(2000);
  });

  it("Custom Cash beyond monthly cap pro-rates: 5% up to $500, 1% on the rest", () => {
    const cc = engineCardFromCatalog("citi_custom_cash");
    // $800 purchase, no YTD: $500 * 5% ($25) + $300 * 1% ($3) = $28 = 2800¢
    const out = recommend({
      amountCents: 80000,
      category: "dining",
      wallet: [cc],
      offers: [],
      valuations: ENGINE_VALUATIONS,
      categorySpendYtdByCard: { [cc.id]: 0 },
    });
    expect(out.winner?.totalValueCents).toBe(2800);
  });
});

describe("engine — new program valuations flow through", () => {
  it("Capital One miles valued at 1.85¢ produces expected earn on Venture X base", () => {
    const vx = engineCardFromCatalog("capone_venture_x");
    // $100 base spend, 2x miles * 1.85¢ = 370¢
    const out = recommend({
      amountCents: 10000,
      category: "everything_else",
      wallet: [vx],
      offers: [],
      valuations: ENGINE_VALUATIONS,
    });
    expect(out.winner?.totalValueCents).toBe(370);
  });

  it("Citi TYP at 1.9¢ produces expected earn on Strata Premier dining", () => {
    const sp = engineCardFromCatalog("citi_strata_premier");
    // $100 dining * 3x * 1.9¢ = 570¢
    const out = recommend({
      amountCents: 10000,
      category: "dining",
      wallet: [sp],
      offers: [],
      valuations: ENGINE_VALUATIONS,
    });
    expect(out.winner?.totalValueCents).toBe(570);
  });
});

// ---------------------------------------------------------------------------
// Regression: the three landing-hero cinematic scenarios must still compute
// their advertised net values. These are re-declared here (not imported from
// the route file) to avoid pulling TanStack route registration into vitest.
// The numbers below must stay in lockstep with src/routes/index.tsx.
// ---------------------------------------------------------------------------

function makeCatalog(entries: Record<string, CardCatalog>): Record<string, CardCatalog> {
  return entries;
}
function makeUc(id: string, catalogId: string): UserCard {
  return {
    id,
    user_id: "demo",
    card_catalog_id: catalogId,
    nickname: null,
    opened_at: null,
    annual_fee_paid_at: null,
    created_at: "",
  };
}

describe("landing scenarios regression — cinematic net values", () => {
  it("Flight scenario: $650 flight → $65.00 on Amex Platinum", () => {
    const catalog = makeCatalog({
      "d-plat": {
        id: "d-plat",
        issuer: "Amex",
        name: "Platinum",
        annual_fee: 695,
        points_program_id: "mr",
        foreign_tx_fee_pct: 0,
        earn_rules: [
          { category: "flights", multiplier: 5 },
          { category: "all", multiplier: 1 },
        ],
        notes: null,
      },
      "d-csr": {
        id: "d-csr",
        issuer: "Chase",
        name: "Sapphire Reserve",
        annual_fee: 550,
        points_program_id: "ur",
        foreign_tx_fee_pct: 0,
        earn_rules: [
          { category: "flights", multiplier: 3 },
          { category: "travel", multiplier: 3 },
          { category: "all", multiplier: 1 },
        ],
        notes: null,
      },
    });
    const programs: Record<string, PointsProgram> = {
      mr: { id: "mr", name: "MR", kind: "transferable", default_cpp: 0.02 },
      ur: { id: "ur", name: "UR", kind: "transferable", default_cpp: 0.02 },
    };
    const plays = planPurchase({
      userCards: [makeUc("u-plat", "d-plat"), makeUc("u-csr", "d-csr")],
      catalog,
      programs,
      offers: [],
      cppOverrides: {},
      merchantCategory: "flights",
      amountCents: 65000,
    });
    expect(plays[0].totalValueCents).toBe(6500);
  });

  it("Groceries scenario: $120 grocery run → $7.20 on Blue Cash Preferred", () => {
    const catalog = makeCatalog({
      "d-bcp": {
        id: "d-bcp",
        issuer: "Amex",
        name: "Blue Cash Preferred",
        annual_fee: 95,
        points_program_id: "cashback",
        foreign_tx_fee_pct: 0.027,
        earn_rules: [
          { category: "groceries", multiplier: 0.06 },
          { category: "all", multiplier: 0.01 },
        ],
        notes: null,
      },
      "d-dc": {
        id: "d-dc",
        issuer: "Citi",
        name: "Double Cash",
        annual_fee: 0,
        points_program_id: "cashback",
        foreign_tx_fee_pct: 0.03,
        earn_rules: [{ category: "all", multiplier: 0.02 }],
        notes: null,
      },
    });
    const programs: Record<string, PointsProgram> = {
      cashback: { id: "cashback", name: "Cash Back", kind: "cashback", default_cpp: 0.01 },
    };
    const plays = planPurchase({
      userCards: [makeUc("u-bcp", "d-bcp"), makeUc("u-dc", "d-dc")],
      catalog,
      programs,
      offers: [],
      cppOverrides: {},
      merchantCategory: "groceries",
      amountCents: 12000,
    });
    expect(plays[0].totalValueCents).toBe(720);
  });

  it("Hotel scenario: $400 Hyatt with $200/$44 offer → $71.20", () => {
    const catalog = makeCatalog({
      "d-hyatt": {
        id: "d-hyatt",
        issuer: "Chase",
        name: "World of Hyatt",
        annual_fee: 95,
        points_program_id: "hyatt",
        foreign_tx_fee_pct: 0,
        earn_rules: [
          { category: "hotel", multiplier: 4 },
          { category: "all", multiplier: 1 },
        ],
        notes: null,
      },
    });
    const programs: Record<string, PointsProgram> = {
      hyatt: { id: "hyatt", name: "Hyatt", kind: "transferable", default_cpp: 0.017 },
    };
    const offer: UserOffer = {
      id: "o1",
      user_id: "demo",
      user_card_id: "u-hyatt",
      merchant_catalog_id: null,
      merchant_text: "Hyatt",
      reward_type: "statement_credit",
      reward_value: 44,
      min_spend: 200,
      expires_at: null,
    };
    const plays = planPurchase({
      userCards: [makeUc("u-hyatt", "d-hyatt")],
      catalog,
      programs,
      offers: [offer],
      cppOverrides: {},
      merchantCategory: "hotel",
      amountCents: 40000,
    });
    // $400 * 4x * 1.7¢ = 2720¢ + $44 credit = 7120¢ = $71.20
    expect(plays[0].totalValueCents).toBe(7120);
  });
});
