// TAP-14 — cross-surface parity. One wallet, one purchase context, routed
// through BOTH surfaces this law consolidates onto the single shared engine:
// Purchases (recommendationEngine.recommend, the engine path) and Decide
// (planner.planPurchase, the planPurchase path). Both must name the same
// winning card at the same value in cents.
//
// The wallet deliberately includes a card whose only earn rule is a
// user-dependent category slug ("top_category"). Without an explicit category
// selection, neither surface may invent that bonus; both must use the safe
// fallback and agree on the same answer.
import { describe, expect, it } from "vitest";
import { recommend as engineRecommend, type EngineCard } from "./recommendationEngine";
import { planPurchase, type PlannerInput } from "./planner";
import type { CardCatalog, PointsProgram, UserCard } from "./types";

const PROGRAMS: Record<string, PointsProgram> = {
  cashback: { id: "cashback", name: "Cash Back", kind: "cashback", default_cpp: 0.01 },
};

const FLAT_ID = "cat_flat_cash";
const TOP_ID = "cat_top_category_cash";

const catalog: Record<string, CardCatalog> = {
  [FLAT_ID]: {
    id: FLAT_ID,
    issuer: "Flatbank",
    name: "Flat Cash",
    annual_fee: 0,
    points_program_id: "cashback",
    foreign_tx_fee_pct: 0,
    earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    notes: null,
  },
  [TOP_ID]: {
    id: TOP_ID,
    issuer: "Rotatebank",
    name: "Top Category Cash",
    annual_fee: 0,
    points_program_id: "cashback",
    foreign_tx_fee_pct: 0,
    // User-dependent rule only — no explicit active-category selection and no
    // "all" / "everything_else" rule.
    earn_rules: [{ category: "top_category", multiplier: 0.05 }],
    notes: null,
  },
};

const userCards: UserCard[] = [
  {
    id: "uc_flat",
    user_id: "u",
    card_catalog_id: FLAT_ID,
    nickname: null,
    opened_at: null,
    annual_fee_paid_at: null,
    created_at: "",
  },
  {
    id: "uc_top",
    user_id: "u",
    card_catalog_id: TOP_ID,
    nickname: null,
    opened_at: null,
    annual_fee_paid_at: null,
    created_at: "",
  },
];

function engineWallet(): EngineCard[] {
  return userCards.map((uc) => {
    const c = catalog[uc.card_catalog_id];
    return {
      id: uc.id,
      card_catalog_id: uc.card_catalog_id,
      nickname: uc.nickname,
      issuer: c.issuer,
      name: c.name,
      points_program_id: c.points_program_id,
      foreign_tx_fee_pct: c.foreign_tx_fee_pct,
      earn_rules: c.earn_rules,
    };
  });
}

const AMOUNT_CENTS = 10000; // $100
const CATEGORY = "dining"; // matches neither card directly — exercises fallback/universal-match

describe("engine parity — Purchases and Decide agree on one wallet", () => {
  it("same wallet, same purchase context, same winning card, same value in cents", () => {
    const valuations: Record<string, number> = {};
    Object.values(PROGRAMS).forEach((p) => (valuations[p.id] = p.default_cpp));

    const purchasesResult = engineRecommend({
      amountCents: AMOUNT_CENTS,
      category: CATEGORY,
      wallet: engineWallet(),
      offers: [],
      valuations,
    });

    const decideResult = planPurchase({
      userCards,
      catalog,
      programs: PROGRAMS,
      offers: [],
      cppOverrides: {},
      merchantCategory: CATEGORY,
      amountCents: AMOUNT_CENTS,
    } satisfies PlannerInput);

    expect(purchasesResult.winner).not.toBeNull();
    expect(decideResult.length).toBeGreaterThan(0);

    const purchasesWinnerCardId = purchasesResult.winner!.legs[0].userCardId;
    const purchasesWinnerCents = purchasesResult.winner!.totalValueCents;
    const decideWinner = decideResult[0];
    const decideWinnerCardId = decideWinner.legs[0].userCardId;
    const decideWinnerCents = decideWinner.totalValueCents;

    // TAP must not assume dining is this customer's top category. The honest
    // winner is the known flat 2% card.
    expect(purchasesWinnerCardId).toBe("uc_flat");
    expect(purchasesWinnerCents).toBe(200);

    expect(decideWinnerCardId).toBe(purchasesWinnerCardId);
    expect(decideWinnerCents).toBe(purchasesWinnerCents);
  });
});

// ---------------------------------------------------------------------------
// TAP-14, capped case.
//
// The parity law above passes today only because no capped card is exercised.
// Caps live entirely in recommendationEngine (EngineInput.capReachedCategoriesByCard,
// EarnRule.cap_period_spend / post_cap_multiplier); PlannerInput has no cap
// field at all, so /decide cannot know a cap was reached even when the customer
// told TAP so on the card guide.
//
// The consequence is a wrong recommendation, not merely a cosmetic one: the
// customer is sent to the capped card at its headline rate while the proof
// sheet reassures them caps were accounted for.
// ---------------------------------------------------------------------------

const ROT_ID = "cat_rotating_capped";

const cappedCatalog: Record<string, CardCatalog> = {
  [FLAT_ID]: catalog[FLAT_ID],
  [ROT_ID]: {
    id: ROT_ID,
    issuer: "Rotatebank",
    name: "Rotating 5",
    annual_fee: 0,
    points_program_id: "cashback",
    foreign_tx_fee_pct: 0,
    earn_rules: [
      {
        category: "dining",
        multiplier: 0.05,
        cap_period_spend: 1500,
        cap_period: "quarterly",
        // Past the cap this card earns 1%, which is worse than Flat Cash's 2%.
        post_cap_multiplier: 0.01,
      },
      { category: "everything_else", multiplier: 0.01 },
    ],
    notes: null,
  },
};

const cappedUserCards: UserCard[] = [
  {
    id: "uc_flat",
    user_id: "u",
    card_catalog_id: FLAT_ID,
    nickname: null,
    opened_at: null,
    annual_fee_paid_at: null,
    created_at: "",
  },
  {
    id: "uc_rot",
    user_id: "u",
    card_catalog_id: ROT_ID,
    nickname: null,
    opened_at: null,
    annual_fee_paid_at: null,
    created_at: "",
  },
];

function cappedEngineWallet(): EngineCard[] {
  return cappedUserCards.map((uc) => {
    const c = cappedCatalog[uc.card_catalog_id];
    return {
      id: uc.id,
      card_catalog_id: uc.card_catalog_id,
      nickname: uc.nickname,
      issuer: c.issuer,
      name: c.name,
      points_program_id: c.points_program_id,
      foreign_tx_fee_pct: c.foreign_tx_fee_pct,
      earn_rules: c.earn_rules,
    };
  });
}

describe("engine parity — a reached cap must move both surfaces", () => {
  it("names the same winner at the same cents when the customer's cap is reached", () => {
    const valuations: Record<string, number> = {};
    Object.values(PROGRAMS).forEach((p) => (valuations[p.id] = p.default_cpp));

    // The customer has told TAP this card's dining cap is blown.
    const purchasesResult = engineRecommend({
      amountCents: AMOUNT_CENTS,
      category: CATEGORY,
      wallet: cappedEngineWallet(),
      offers: [],
      valuations,
      capReachedCategoriesByCard: { uc_rot: [CATEGORY] },
    });

    // Parity is only meaningful when both surfaces are told the same thing, so
    // Decide receives the identical cap state the engine was given.
    const decideResult = planPurchase({
      userCards: cappedUserCards,
      catalog: cappedCatalog,
      programs: PROGRAMS,
      offers: [],
      cppOverrides: {},
      merchantCategory: CATEGORY,
      amountCents: AMOUNT_CENTS,
      capReachedCategoriesByCard: { uc_rot: [CATEGORY] },
    } satisfies PlannerInput);

    expect(purchasesResult.winner).not.toBeNull();
    expect(decideResult.length).toBeGreaterThan(0);

    // With the cap reached, the rotating card earns its post-cap 1% ($1.00),
    // so the honest winner is Flat Cash at 2% ($2.00 = 200 cents).
    expect(purchasesResult.winner!.legs[0].userCardId).toBe("uc_flat");
    expect(purchasesResult.winner!.totalValueCents).toBe(200);

    // Decide must agree. It currently does not: with no cap input it still
    // sees dining at 5% and returns Rotating 5 at 500 cents — the wrong card
    // at 2.5x the real value.
    expect(decideResult[0].legs[0].userCardId).toBe(purchasesResult.winner!.legs[0].userCardId);
    expect(decideResult[0].totalValueCents).toBe(purchasesResult.winner!.totalValueCents);
  });
});
