// TAP-14 — cross-surface parity. One wallet, one purchase context, routed
// through BOTH surfaces this law consolidates onto the single shared engine:
// Purchases (recommendationEngine.recommend, the engine path) and Decide
// (planner.planPurchase, the planPurchase path). Both must name the same
// winning card at the same value in cents.
//
// The wallet deliberately includes a card whose only earn rule is a
// universal-match category slug ("top_category" — the Citi Custom Cash /
// BofA Customized Cash pattern). recommendationEngine.ts has always
// recognized that slug as a category match (UNIVERSAL_MATCH_SLUGS); before
// TAP-3's consolidation, planner.ts's own independent rule-matching did not,
// so it fell through to a hardcoded 1x default instead — a real, silent
// divergence between the two surfaces on exactly this kind of card. Cashback
// (multiplier < 1) cards are used throughout so the comparison isolates
// rule-matching parity from any cpp/points valuation concern.
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
    // Universal-match rule only — no direct "dining" rule and no "all" /
    // "everything_else" fallback rule on this card at all.
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

    // The correctly-matched winner is the universal-match ("top_category")
    // card at its real 5% rate: $100 * 5% = $5.00 = 500 cents.
    expect(purchasesWinnerCardId).toBe("uc_top");
    expect(purchasesWinnerCents).toBe(500);

    expect(decideWinnerCardId).toBe(purchasesWinnerCardId);
    expect(decideWinnerCents).toBe(purchasesWinnerCents);
  });
});
