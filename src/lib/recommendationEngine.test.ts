import { describe, expect, it } from "vitest";
import {
  recommend,
  deltaVsBestSingleCents,
  type EngineCard,
  type EngineInput,
  type EngineOffer,
} from "./recommendationEngine";

const cardA = (): EngineCard => ({
  id: "card_a",
  card_catalog_id: "a",
  issuer: "Bank",
  name: "Card A",
  points_program_id: "cashback",
  foreign_tx_fee_pct: 0,
  earn_rules: [{ category: "everything_else", multiplier: 1 }],
});

const cardB = (): EngineCard => ({
  id: "card_b",
  card_catalog_id: "b",
  issuer: "Bank",
  name: "Card B",
  points_program_id: "hyatt",
  foreign_tx_fee_pct: 0,
  earn_rules: [
    { category: "hotels", multiplier: 3 },
    { category: "everything_else", multiplier: 1 },
  ],
});

describe("recommendationEngine — canonical hotel split scenario", () => {
  it("$400 hotel: split ($300 on A unlocks $50 off, $100 on B 3x@1.7cpp) beats single-card plays", () => {
    const input: EngineInput = {
      amountCents: 40000,
      category: "hotels",
      wallet: [cardA(), cardB()],
      offers: [
        {
          id: "o1",
          user_card_id: "card_a",
          offer_type: "dollars_off_threshold",
          discount_amount: 50,
          spend_threshold: 300,
        },
      ],
      valuations: { cashback: 1.0, hyatt: 1.7 },
    };
    const out = recommend(input);

    // Winner is the split play with A first (unlock), B second (remainder).
    expect(out.winner?.kind).toBe("split");
    expect(out.winner?.legs).toHaveLength(2);
    expect(out.winner?.legs[0].userCardId).toBe("card_a");
    expect(out.winner?.legs[0].amountCents).toBe(30000);
    expect(out.winner?.legs[1].userCardId).toBe("card_b");
    expect(out.winner?.legs[1].amountCents).toBe(10000);

    // Split math: 300 * 1 pt * 1.0 cpp = 300¢ + $50 offer = 5300¢; then 100 * 3 * 1.7 = 510¢. Total = 5810¢ = $58.10
    expect(out.winner?.totalValueCents).toBe(5810);

    // Runner-up is single Card A with the offer: 400 * 1 * 1.0 cpp = 400¢ + $50 = 5400¢ = $54.00
    expect(out.runnerUp?.kind).toBe("single");
    expect(out.runnerUp?.legs[0].userCardId).toBe("card_a");
    expect(out.runnerUp?.totalValueCents).toBe(5400);

    // Delta vs runner-up = 5810 - 5400 = 410¢ = $4.10
    expect(out.dollarDeltaCents).toBe(410);

    // Delta vs best single-card play: same 410¢ here (best single is Card A with offer).
    expect(deltaVsBestSingleCents(out)).toBe(410);
  });
});

describe("recommendationEngine — other cases", () => {
  it("describes points as points with estimated value, never as cash back", () => {
    const out = recommend({
      amountCents: 40_000,
      category: "dining",
      wallet: [
        {
          id: "gold",
          card_catalog_id: "gold",
          issuer: "American Express",
          name: "Gold",
          points_program_id: "mr",
          foreign_tx_fee_pct: 0,
          earn_rules: [
            { category: "dining", multiplier: 4 },
            { category: "everything_else", multiplier: 1 },
          ],
        },
      ],
      offers: [],
      valuations: { mr: 2 },
    });

    expect(out.winner?.headline).toContain("1,600 points");
    expect(out.winner?.headline).toContain("estimated $32 value at 2.00¢/pt");
    expect(out.winner?.headline).not.toContain("back");
    expect(out.winner?.legs[0]).toMatchObject({
      rewardKind: "points",
      pointsEarned: 1600,
      cppCents: 2,
      programId: "mr",
    });
  });

  it("reserves cash-back wording for true cashback earn rules", () => {
    const out = recommend({
      amountCents: 10_000,
      category: "everything_else",
      wallet: [
        {
          id: "cash",
          card_catalog_id: "cash",
          issuer: "Bank",
          name: "Cash Card",
          points_program_id: "cashback",
          foreign_tx_fee_pct: 0,
          earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
        },
      ],
      offers: [],
      valuations: { cashback: 1 },
    });

    expect(out.winner?.headline).toContain("$2 cash back");
    expect(out.winner?.headline).not.toContain("points");
    expect(out.winner?.legs[0]).toMatchObject({
      rewardKind: "cashback",
      pointsEarned: 0,
    });
  });

  it("returns empty-wallet guidance when wallet is empty", () => {
    const out = recommend({
      amountCents: 5000,
      category: "dining",
      wallet: [],
      offers: [],
      valuations: {},
    });
    expect(out.winner).toBeNull();
    expect(out.emptyWalletGuidance).toBe("empty_wallet");
    expect(out.explanation).toMatch(/add cards/i);
  });

  it("excludes expired offers", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const input: EngineInput = {
      amountCents: 40000,
      category: "hotels",
      wallet: [cardA(), cardB()],
      offers: [
        {
          id: "o1",
          user_card_id: "card_a",
          offer_type: "dollars_off_threshold",
          discount_amount: 50,
          spend_threshold: 300,
          expires_on: yesterday.toISOString(),
        },
      ],
      valuations: { cashback: 1.0, hyatt: 1.7 },
    };
    const out = recommend(input);
    // No offer -> best play is single Card B (3x hotels): 400*3*1.7 = 2040¢
    expect(out.winner?.kind).toBe("single");
    expect(out.winner?.legs[0].userCardId).toBe("card_b");
    expect(out.winner?.totalValueCents).toBe(2040);
  });

  it("keeps a date-only offer active through the end of its stated date", () => {
    const out = recommend({
      amountCents: 10000,
      category: "everything_else",
      wallet: [cardA()],
      offers: [
        {
          id: "today",
          user_card_id: "card_a",
          offer_type: "statement_credit",
          discount_amount: 10,
          expires_on: "2026-07-29",
        },
      ],
      valuations: { cashback: 1 },
      now: new Date("2026-07-29T18:00:00.000Z"),
    });
    expect(out.winner?.legs[0].offerValueCents).toBe(1000);
  });

  it("treats a date-only expiry as the customer's local calendar day", () => {
    const input = {
      amountCents: 10000,
      category: "everything_else",
      wallet: [cardA()],
      offers: [
        {
          id: "today",
          user_card_id: "card_a",
          offer_type: "statement_credit" as const,
          discount_amount: 10,
          expires_on: "2026-07-29",
        },
      ],
      valuations: { cashback: 1 },
    };

    expect(
      recommend({ ...input, now: new Date(2026, 6, 29, 23, 30) }).winner?.legs[0].offerValueCents,
    ).toBe(1000);
    expect(
      recommend({ ...input, now: new Date(2026, 6, 30, 0, 0) }).winner?.legs[0].offerValueCents,
    ).toBe(0);
  });

  it("category cap exceeded falls back to everything_else", () => {
    const capped: EngineCard = {
      id: "card_capped",
      card_catalog_id: "c",
      issuer: "Bank",
      name: "Capped",
      points_program_id: "cashback",
      foreign_tx_fee_pct: 0,
      earn_rules: [
        { category: "groceries", multiplier: 0.06, cap_annual_spend: 6000 },
        { category: "everything_else", multiplier: 0.01 },
      ],
    };
    // $100 grocery purchase, but already spent $6000 YTD -> falls back to 1%.
    const out = recommend({
      amountCents: 10000,
      category: "groceries",
      wallet: [capped],
      offers: [],
      valuations: { cashback: 1.0 },
      categorySpendYtdByCard: { card_capped: 6000 },
    });
    expect(out.winner?.totalValueCents).toBe(100); // $100 * 1% = $1.00 = 100¢
  });

  it("applies foreign transaction penalty", () => {
    const foreignFeeCard: EngineCard = {
      id: "card_ft",
      card_catalog_id: "d",
      issuer: "Bank",
      name: "FT",
      points_program_id: "cashback",
      foreign_tx_fee_pct: 3,
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    };
    const out = recommend({
      amountCents: 10000,
      category: "everything_else",
      wallet: [foreignFeeCard],
      offers: [],
      valuations: { cashback: 1.0 },
      foreign: true,
    });
    // 2% back = 200¢, minus 3% foreign fee = 300¢, net = -100¢
    expect(out.winner?.totalValueCents).toBe(-100);
  });

  it("skips offers marked is_used", () => {
    const out = recommend({
      amountCents: 40000,
      category: "hotels",
      wallet: [cardA(), cardB()],
      offers: [
        {
          id: "o1",
          user_card_id: "card_a",
          offer_type: "dollars_off_threshold",
          discount_amount: 50,
          spend_threshold: 300,
          is_used: true,
        },
      ],
      valuations: { cashback: 1.0, hyatt: 1.7 },
    });
    expect(out.winner?.kind).toBe("single");
    expect(out.winner?.legs[0].userCardId).toBe("card_b");
  });
});

describe("recommendationEngine — phase 3 correctness suite", () => {
  it("single card beats split when the offer is too small to justify losing category earn", () => {
    // $400 hotels, Card A has $5-off-$300 offer @ 1x cashback,
    // Card B earns 5x on hotels @ 1.7 cpp. Split would earn:
    //   $300*1*1.0 = 300¢ + $5 offer = 800¢, plus $100*5*1.7 = 850¢ → 1650¢
    // Single Card B: $400*5*1.7 = 3400¢. Single wins.
    const out = recommend({
      amountCents: 40000,
      category: "hotels",
      wallet: [
        cardA(),
        {
          ...cardB(),
          earn_rules: [
            { category: "hotels", multiplier: 5 },
            { category: "everything_else", multiplier: 1 },
          ],
        },
      ],
      offers: [
        {
          id: "small",
          user_card_id: "card_a",
          offer_type: "dollars_off_threshold",
          discount_amount: 5,
          spend_threshold: 300,
        },
      ],
      valuations: { cashback: 1.0, hyatt: 1.7 },
    });
    expect(out.winner?.kind).toBe("single");
    expect(out.winner?.legs[0].userCardId).toBe("card_b");
    expect(out.winner?.totalValueCents).toBe(3400);
  });

  it("percent_back offer respects max_benefit cap", () => {
    // 10% back on $500 = $50, capped at $10.
    const out = recommend({
      amountCents: 50000,
      category: "everything_else",
      wallet: [cardA()],
      offers: [
        {
          id: "pct",
          user_card_id: "card_a",
          offer_type: "percent_back",
          discount_amount: 10, // 10%
          spend_threshold: 0,
          max_benefit: 10, // dollars
        },
      ],
      valuations: { cashback: 1.0 },
    });
    // base = $500 * 1 * 1.0 = 500¢. offer = min(5000, 1000) = 1000¢. Total = 1500¢.
    expect(out.winner?.legs[0].offerValueCents).toBe(1000);
    expect(out.winner?.totalValueCents).toBe(1500);
  });

  it("bonus_points offer is valued through the card's cpp", () => {
    // Extra 4 pts/$ on $100 hyatt purchase, hyatt at 1.7 cpp.
    // base: card B earns 3x hotels * 1.7 = 510¢. offer: 4 * 100 * 1.7 = 680¢.
    const out = recommend({
      amountCents: 10000,
      category: "hotels",
      wallet: [cardB()],
      offers: [
        {
          id: "bp",
          user_card_id: "card_b",
          offer_type: "bonus_points",
          discount_amount: 4, // extra points per dollar
          spend_threshold: 0,
        },
      ],
      valuations: { hyatt: 1.7 },
    });
    expect(out.winner?.legs[0].baseEarnCents).toBe(510);
    expect(out.winner?.legs[0].offerValueCents).toBe(680);
    expect(out.winner?.totalValueCents).toBe(1190);
  });

  it("when two offers exist on the same card, the better one is chosen", () => {
    // Purchase $400. Offer X: $10 off $100. Offer Y: $50 off $300. Both apply; better = Y.
    const out = recommend({
      amountCents: 40000,
      category: "everything_else",
      wallet: [cardA()],
      offers: [
        {
          id: "worse",
          user_card_id: "card_a",
          offer_type: "dollars_off_threshold",
          discount_amount: 10,
          spend_threshold: 100,
        },
        {
          id: "better",
          user_card_id: "card_a",
          offer_type: "dollars_off_threshold",
          discount_amount: 50,
          spend_threshold: 300,
        },
      ],
      valuations: { cashback: 1.0 },
    });
    // base = 400¢. offer = 5000¢. Total = 5400¢.
    expect(out.winner?.legs[0].offerValueCents).toBe(5000);
    expect(out.winner?.totalValueCents).toBe(5400);
  });

  it("treats a multiplier offer as the total rate rather than stacking it", () => {
    const twoX = {
      ...cardB(),
      earn_rules: [{ category: "everything_else", multiplier: 2 }],
    };
    const out = recommend({
      amountCents: 10000,
      category: "everything_else",
      wallet: [twoX],
      offers: [
        {
          id: "five_x",
          user_card_id: twoX.id,
          offer_type: "multiplier",
          discount_amount: 5,
        },
      ],
      valuations: { hyatt: 1 },
    });
    expect(out.winner?.legs[0].baseEarnCents).toBe(200);
    expect(out.winner?.legs[0].offerValueCents).toBe(300);
    expect(out.winner?.totalValueCents).toBe(500);
  });

  it("offer threshold exactly equal to purchase amount: single-card play uses offer, no split", () => {
    const out = recommend({
      amountCents: 30000, // exactly threshold
      category: "everything_else",
      wallet: [cardA(), cardB()],
      offers: [
        {
          id: "eq",
          user_card_id: "card_a",
          offer_type: "dollars_off_threshold",
          discount_amount: 50,
          spend_threshold: 300,
        },
      ],
      valuations: { cashback: 1.0, hyatt: 1.7 },
    });
    expect(out.winner?.kind).toBe("single");
    expect(out.winner?.legs[0].userCardId).toBe("card_a");
    // base 300¢ + offer 5000¢ = 5300¢
    expect(out.winner?.totalValueCents).toBe(5300);
    // No split play should have been created
    expect(out.mathTable.some((r) => r.playKind === "split")).toBe(false);
  });

  it("zero amount returns guidance, no winner", () => {
    const out = recommend({
      amountCents: 0,
      category: "dining",
      wallet: [cardA()],
      offers: [],
      valuations: { cashback: 1.0 },
    });
    expect(out.winner).toBeNull();
    expect(out.explanation).toMatch(/enter an amount/i);
  });

  it("negative amount returns guidance, no winner", () => {
    const out = recommend({
      amountCents: -100,
      category: "dining",
      wallet: [cardA()],
      offers: [],
      valuations: { cashback: 1.0 },
    });
    expect(out.winner).toBeNull();
    expect(out.mathTable).toHaveLength(0);
  });

  it("property: winner totalValue >= every other play in mathTable", () => {
    // Randomized-ish inputs across a range of scenarios.
    const scenarios: EngineInput[] = [
      {
        amountCents: 12345,
        category: "dining",
        wallet: [cardA(), cardB()],
        offers: [],
        valuations: { cashback: 1.0, hyatt: 1.7 },
      },
      {
        amountCents: 99900,
        category: "hotels",
        wallet: [cardA(), cardB()],
        offers: [
          {
            id: "z",
            user_card_id: "card_a",
            offer_type: "dollars_off_threshold",
            discount_amount: 75,
            spend_threshold: 500,
          },
        ],
        valuations: { cashback: 1.0, hyatt: 1.7 },
      },
      {
        amountCents: 25000,
        category: "everything_else",
        wallet: [cardA(), cardB()],
        offers: [
          {
            id: "p",
            user_card_id: "card_b",
            offer_type: "percent_back",
            discount_amount: 8,
            spend_threshold: 100,
            max_benefit: 20,
          },
        ],
        valuations: { cashback: 1.0, hyatt: 1.7 },
      },
    ];
    for (const input of scenarios) {
      const out = recommend(input);
      if (!out.winner) continue;
      const w = out.winner.totalValueCents;
      for (const row of out.mathTable) {
        expect(row.totalCents).toBeLessThanOrEqual(w);
      }
    }
  });
});

// Regression: launch-blocker bug — planning "Whole Foods" (custom merchant
// category the earn rules don't name) with a 3-Chase-card wallet returned
// "No applicable play." The invariant below locks it: with any wallet that
// has at least one card with a base earn rule, ANY category input must
// return a non-null winner.
describe("recommendationEngine — invariant: never dead-end on category", () => {
  const chaseWallet = (): EngineCard[] => [
    {
      id: "uc_cfu",
      card_catalog_id: "chase_freedom_unlimited",
      issuer: "Chase",
      name: "Freedom Unlimited",
      points_program_id: "chase_ur",
      foreign_tx_fee_pct: 3,
      earn_rules: [
        { category: "travel_portal", multiplier: 5 },
        { category: "dining", multiplier: 3 },
        { category: "drugstores", multiplier: 3 },
        { category: "everything_else", multiplier: 1.5 },
      ],
    },
    {
      id: "uc_csp",
      card_catalog_id: "chase_csp",
      issuer: "Chase",
      name: "Sapphire Preferred",
      points_program_id: "chase_ur",
      foreign_tx_fee_pct: 0,
      earn_rules: [
        { category: "travel_portal", multiplier: 5 },
        { category: "dining", multiplier: 3 },
        { category: "everything_else", multiplier: 1 },
      ],
    },
    {
      id: "uc_csr",
      card_catalog_id: "chase_csr",
      issuer: "Chase",
      name: "Sapphire Reserve",
      points_program_id: "chase_ur",
      foreign_tx_fee_pct: 0,
      earn_rules: [
        { category: "flights", multiplier: 4 },
        { category: "dining", multiplier: 3 },
        { category: "everything_else", multiplier: 1 },
      ],
    },
  ];

  const cases: Array<{ label: string; category: string }> = [
    { label: "Whole Foods repro (whole_foods)", category: "whole_foods" },
    { label: "DB-shape category (groceries)", category: "groceries" },
    { label: "gibberish category", category: "qwertyzzz_not_a_slug" },
    { label: "empty category", category: "" },
    { label: "everything_else", category: "everything_else" },
  ];

  for (const c of cases) {
    it(`always returns a play for ${c.label}`, () => {
      const out = recommend({
        amountCents: 48000,
        category: c.category,
        wallet: chaseWallet(),
        offers: [],
        valuations: { chase_ur: 0.021 },
      });
      expect(out.winner).not.toBeNull();
      expect(out.winner!.legs.length).toBeGreaterThan(0);
      // Freedom Unlimited's 1.5x base must win over the two 1x cards.
      expect(out.winner!.legs[0].userCardId).toBe("uc_cfu");
    });
  }

  it("returns a play with a single-card wallet and gibberish merchant string", () => {
    const out = recommend({
      amountCents: 12300,
      category: "gibberish",
      merchant: "some strange custom merchant name",
      wallet: [chaseWallet()[0]],
      offers: [],
      valuations: { chase_ur: 0.021 },
    });
    expect(out.winner).not.toBeNull();
  });
});

describe("recommendationEngine — merchant-category fallbacks", () => {
  const amexGold: EngineCard = {
    id: "uc_amex_gold",
    card_catalog_id: "amex_gold",
    issuer: "American Express",
    name: "Gold",
    points_program_id: "amex_mr",
    foreign_tx_fee_pct: 0,
    earn_rules: [
      { category: "groceries", multiplier: 4 },
      { category: "everything_else", multiplier: 1 },
    ],
  };
  const sapphire: EngineCard = {
    id: "uc_sapphire",
    card_catalog_id: "chase_csp",
    issuer: "Chase",
    name: "Sapphire Preferred",
    points_program_id: "chase_ur",
    foreign_tx_fee_pct: 0,
    earn_rules: [{ category: "everything_else", multiplier: 1 }],
  };
  const primeVisa: EngineCard = {
    id: "uc_prime",
    card_catalog_id: "amazon_prime_visa",
    issuer: "Chase",
    name: "Prime Visa",
    points_program_id: "cashback",
    foreign_tx_fee_pct: 0,
    earn_rules: [
      { category: "whole_foods", multiplier: 0.05 },
      { category: "everything_else", multiplier: 0.01 },
    ],
  };

  it("treats Whole Foods as groceries when a card has no merchant-specific rule", () => {
    const out = recommend({
      amountCents: 8400,
      category: "whole_foods",
      wallet: [amexGold, sapphire],
      offers: [],
      valuations: { amex_mr: 1, chase_ur: 1 },
    });

    expect(out.winner?.legs[0].userCardId).toBe("uc_amex_gold");
    expect(out.winner?.totalValueCents).toBe(336);
  });

  it("prefers an exact Whole Foods rule over the grocery fallback", () => {
    const out = recommend({
      amountCents: 8400,
      category: "whole_foods",
      wallet: [amexGold, primeVisa],
      offers: [],
      valuations: { amex_mr: 1, cashback: 1 },
    });

    expect(out.winner?.legs[0].userCardId).toBe("uc_prime");
    expect(out.winner?.totalValueCents).toBe(420);
  });
});

describe("earn caps — reason line honesty + toggle rescoring", () => {
  const capped = (): EngineCard => ({
    id: "card_capped",
    card_catalog_id: "c",
    issuer: "Bank",
    name: "Capped",
    points_program_id: "cashback",
    foreign_tx_fee_pct: 0,
    earn_rules: [
      {
        category: "groceries",
        multiplier: 0.05,
        cap_period_spend: 500,
        cap_period: "monthly",
        post_cap_multiplier: 0.01,
      },
      { category: "everything_else", multiplier: 0.01 },
    ],
  });
  const flat = (): EngineCard => ({
    id: "card_flat",
    card_catalog_id: "f",
    issuer: "Bank",
    name: "Flat 2%",
    points_program_id: "cashback",
    foreign_tx_fee_pct: 0,
    earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
  });

  it("capped rule reason includes cap text and post-cap rate", () => {
    const out = recommend({
      amountCents: 5000,
      category: "groceries",
      wallet: [capped()],
      offers: [],
      valuations: {},
    });
    expect(out.winner!.legs[0].reason).toMatch(/up to \$500\/mo, then 1%/i);
  });

  it("cap-reached toggle rescores at post-cap rate and flips the winner", () => {
    const wallet = [capped(), flat()];
    const base = recommend({
      amountCents: 10000,
      category: "groceries",
      wallet,
      offers: [],
      valuations: {},
    });
    // Uncapped: capped card wins at 5%.
    expect(base.winner!.legs[0].userCardId).toBe("card_capped");

    const toggled = recommend({
      amountCents: 10000,
      category: "groceries",
      wallet,
      offers: [],
      valuations: {},
      capReachedCategoriesByCard: { card_capped: ["groceries"] },
    });
    // Toggled: capped card drops to 1%, flat 2% wins.
    expect(toggled.winner!.legs[0].userCardId).toBe("card_flat");
  });

  it("uncapped cards are unaffected by the toggle", () => {
    const out = recommend({
      amountCents: 5000,
      category: "everything_else",
      wallet: [flat()],
      offers: [],
      valuations: {},
      capReachedCategoriesByCard: { card_flat: ["everything_else"] },
    });
    expect(out.winner!.legs[0].baseEarnCents).toBe(100); // 2% of $50
  });
});
