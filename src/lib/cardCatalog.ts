// Canonical catalog of the top 25 US consumer rewards cards for TAP.
// Every card was verified against the issuer's own product page on the
// RATES_VERIFIED_ON date below. Do not edit rates without re-verifying.
//
// Category slugs are snake_case. Special slugs:
//   - "everything_else": base earn (fallback).
//   - "top_category": Citi Custom Cash-style — top-spend category each cycle.
//     Engine treats as universal-match with cap.
//   - "rotating_5pct": Chase Freedom Flex / Discover it rotating quarters.
//     Engine treats as universal-match with cap (best-case).
//   - "choose_category": BofA Customized Cash choose-your-3%.
//     Engine treats as universal-match with cap.
// These special slugs are best-case estimates; the assumption note in the UI
// discloses that we assume the user's purchase is in the selected/active category.
//
// Category caps:
//   cap_annual_spend (dollars YTD)
//   cap_quarterly_spend / cap_monthly_spend — engine reads either via a single
//   cap_period_spend field carried through EarnRule. The catalog encodes the
//   authoritative dollars-per-period value.

export const RATES_VERIFIED_ON = "2026-07-12";

export type CatalogEarnRule = {
  category: string;
  multiplier: number; // >=1 = points-per-dollar; <1 = cashback fraction (e.g. 0.05 = 5%)
  cap_period_spend?: number; // dollars per cap_period
  cap_annual_spend?: number; // legacy alias — engine reads either
  cap_period?: "annual" | "quarterly" | "monthly";
  // Explicit post-cap rate. When omitted, the engine falls back to the
  // card's everything_else / all base rule (existing behavior).
  post_cap_multiplier?: number;
  note?: string;
};

export type CatalogCard = {
  id: string;
  issuer: string;
  name: string;
  annual_fee: number; // USD
  foreign_tx_fee_pct: number; // percent, e.g. 3 for 3%
  points_program_id: string;
  earn_rules: CatalogEarnRule[];
  rates_verified_on: string;
  source: string;
  notes?: string;
};

export const CARD_CATALOG: CatalogCard[] = [
  {
    id: "chase_csp",
    issuer: "Chase",
    name: "Sapphire Preferred",
    annual_fee: 95,
    foreign_tx_fee_pct: 0,
    points_program_id: "chase_ur",
    earn_rules: [
      { category: "travel_portal", multiplier: 5 },
      { category: "dining", multiplier: 3 },
      { category: "gas", multiplier: 3, note: "includes EV charging" },
      { category: "online_groceries", multiplier: 3 },
      { category: "streaming", multiplier: 3 },
      { category: "travel", multiplier: 2 },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.chase.com/sapphire-cards/personal/preferred",
  },
  {
    id: "chase_csr",
    issuer: "Chase",
    name: "Sapphire Reserve",
    annual_fee: 795,
    foreign_tx_fee_pct: 0,
    points_program_id: "chase_ur",
    earn_rules: [
      { category: "travel_portal", multiplier: 8 },
      { category: "flights", multiplier: 4, note: "booked directly with airline" },
      { category: "hotels", multiplier: 4, note: "booked directly with hotel" },
      { category: "dining", multiplier: 3 },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.chase.com/sapphire-cards/personal/reserve",
  },
  {
    id: "chase_freedom_unlimited",
    issuer: "Chase",
    name: "Freedom Unlimited",
    annual_fee: 0,
    foreign_tx_fee_pct: 3,
    points_program_id: "chase_ur",
    earn_rules: [
      { category: "travel_portal", multiplier: 5 },
      { category: "dining", multiplier: 3 },
      { category: "drugstores", multiplier: 3 },
      { category: "everything_else", multiplier: 1.5 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.chase.com/personal/credit-cards/freedom/unlimited",
  },
  {
    id: "chase_freedom_flex",
    issuer: "Chase",
    name: "Freedom Flex",
    annual_fee: 0,
    foreign_tx_fee_pct: 3,
    points_program_id: "chase_ur",
    earn_rules: [
      {
        category: "rotating_5pct",
        multiplier: 0.05,
        cap_period_spend: 1500,
        cap_period: "quarterly",
        note: "rotating quarterly categories, 5% up to $1,500/qtr",
      },
      { category: "travel_portal", multiplier: 5 },
      { category: "dining", multiplier: 3 },
      { category: "drugstores", multiplier: 3 },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.chase.com/personal/credit-cards/freedom/flex",
  },
  {
    id: "chase_world_of_hyatt",
    issuer: "Chase",
    name: "World of Hyatt",
    annual_fee: 95,
    foreign_tx_fee_pct: 0,
    points_program_id: "hyatt_wob",
    earn_rules: [
      {
        category: "hotels",
        multiplier: 4,
        note: "Hyatt hotels; base points earned separately from Hyatt",
      },
      { category: "dining", multiplier: 2 },
      { category: "flights", multiplier: 2 },
      { category: "transit", multiplier: 2 },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.chase.com/personal/credit-cards/hyatt/world-hyatt/earn-points",
  },
  {
    id: "chase_united_explorer",
    issuer: "Chase",
    name: "United Explorer",
    annual_fee: 150,
    foreign_tx_fee_pct: 0,
    points_program_id: "united_ma",
    earn_rules: [
      { category: "flights", multiplier: 3, note: "United purchases" },
      { category: "dining", multiplier: 2 },
      { category: "hotels", multiplier: 2, note: "booked directly with hotel" },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.chase.com/personal/credit-cards/united/united-explorer-card/earn-rewards",
    notes: "Ongoing annual fee $150 after intro year.",
  },
  {
    id: "chase_amazon_prime_visa",
    issuer: "Chase",
    name: "Amazon Prime Visa",
    annual_fee: 0,
    foreign_tx_fee_pct: 3,
    points_program_id: "cashback",
    earn_rules: [
      { category: "amazon", multiplier: 0.05, note: "with Prime membership" },
      { category: "whole_foods", multiplier: 0.05, note: "with Prime membership" },
      { category: "travel_portal", multiplier: 0.05 },
      { category: "gas", multiplier: 0.02 },
      { category: "dining", multiplier: 0.02 },
      { category: "transit", multiplier: 0.02 },
      { category: "everything_else", multiplier: 0.01 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://creditcards.chase.com/cash-back-credit-cards/amazon-prime-rewards",
  },
  {
    id: "amex_platinum",
    issuer: "American Express",
    name: "Platinum",
    annual_fee: 895,
    foreign_tx_fee_pct: 0,
    points_program_id: "amex_mr",
    earn_rules: [
      {
        category: "flights",
        multiplier: 5,
        cap_period_spend: 500000,
        cap_period: "annual",
        note: "direct with airlines or Amex Travel",
      },
      { category: "hotels", multiplier: 5, note: "prepaid on Amex Travel" },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
  },
  {
    id: "amex_gold",
    issuer: "American Express",
    name: "Gold",
    annual_fee: 325,
    foreign_tx_fee_pct: 0,
    points_program_id: "amex_mr",
    earn_rules: [
      { category: "dining", multiplier: 4, cap_period_spend: 50000, cap_period: "annual" },
      { category: "groceries", multiplier: 4, cap_period_spend: 25000, cap_period: "annual" },
      { category: "hotels", multiplier: 5, note: "prepaid on AmexTravel.com" },
      { category: "flights", multiplier: 3, note: "booked on AmexTravel.com" },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.americanexpress.com/en-us/account/get-started/gold/explore-benefits",
  },
  {
    id: "amex_blue_cash_preferred",
    issuer: "American Express",
    name: "Blue Cash Preferred",
    annual_fee: 95,
    foreign_tx_fee_pct: 2.7,
    points_program_id: "cashback",
    earn_rules: [
      { category: "groceries", multiplier: 0.06, cap_period_spend: 6000, cap_period: "annual" },
      { category: "streaming", multiplier: 0.06 },
      { category: "transit", multiplier: 0.03 },
      { category: "gas", multiplier: 0.03 },
      { category: "everything_else", multiplier: 0.01 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/",
  },
  {
    id: "amex_blue_cash_everyday",
    issuer: "American Express",
    name: "Blue Cash Everyday",
    annual_fee: 0,
    foreign_tx_fee_pct: 2.7,
    points_program_id: "cashback",
    earn_rules: [
      { category: "groceries", multiplier: 0.03, cap_period_spend: 6000, cap_period: "annual" },
      {
        category: "amazon",
        multiplier: 0.03,
        cap_period_spend: 6000,
        cap_period: "annual",
        note: "U.S. online retail",
      },
      { category: "gas", multiplier: 0.03, cap_period_spend: 6000, cap_period: "annual" },
      { category: "everything_else", multiplier: 0.01 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/",
  },
  {
    id: "amex_delta_gold",
    issuer: "American Express",
    name: "Delta SkyMiles Gold",
    annual_fee: 150,
    foreign_tx_fee_pct: 0,
    points_program_id: "delta_sky",
    earn_rules: [
      { category: "dining", multiplier: 2 },
      { category: "groceries", multiplier: 2 },
      { category: "flights", multiplier: 2, note: "direct with Delta" },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source:
      "https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-gold-american-express-card/",
  },
  {
    id: "citi_double_cash",
    issuer: "Citi",
    name: "Double Cash",
    annual_fee: 0,
    foreign_tx_fee_pct: 3,
    points_program_id: "citi_typ",
    earn_rules: [
      { category: "travel_portal", multiplier: 0.05, note: "Citi Travel" },
      { category: "everything_else", multiplier: 0.02 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source:
      "https://www.citi.com/credit-cards/credit-card-rewards/citi-double-cash-credit-card-benefits",
  },
  {
    id: "citi_custom_cash",
    issuer: "Citi",
    name: "Custom Cash",
    annual_fee: 0,
    foreign_tx_fee_pct: 3,
    points_program_id: "citi_typ",
    earn_rules: [
      {
        category: "top_category",
        multiplier: 0.05,
        cap_period_spend: 500,
        cap_period: "monthly",
        note: "top eligible category each billing cycle",
      },
      { category: "everything_else", multiplier: 0.01 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.citi.com/usc/LPACA/Citi/Cards/CustomCash/legal/index.html",
  },
  {
    id: "citi_strata_premier",
    issuer: "Citi",
    name: "Strata Premier",
    annual_fee: 95,
    foreign_tx_fee_pct: 0,
    points_program_id: "citi_typ",
    earn_rules: [
      { category: "hotels", multiplier: 10, note: "via Citi Travel" },
      { category: "flights", multiplier: 3 },
      { category: "dining", multiplier: 3 },
      { category: "gas", multiplier: 3 },
      { category: "groceries", multiplier: 3 },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source:
      "https://www.citi.com/credit-cards/credit-card-rewards/citi-strata-premier-travel-benefits",
  },
  {
    id: "capone_venture_x",
    issuer: "Capital One",
    name: "Venture X",
    annual_fee: 395,
    foreign_tx_fee_pct: 0,
    points_program_id: "capone_miles",
    earn_rules: [
      { category: "hotels", multiplier: 10, note: "via Capital One Travel" },
      { category: "flights", multiplier: 5, note: "via Capital One Travel" },
      { category: "everything_else", multiplier: 2 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.capitalone.com/credit-cards/venture-x/",
  },
  {
    id: "capone_venture",
    issuer: "Capital One",
    name: "Venture",
    annual_fee: 95,
    foreign_tx_fee_pct: 0,
    points_program_id: "capone_miles",
    earn_rules: [
      { category: "hotels", multiplier: 5, note: "via Capital One Travel" },
      { category: "everything_else", multiplier: 2 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.capitalone.com/credit-cards/venture/",
  },
  {
    id: "capone_savor",
    issuer: "Capital One",
    name: "Savor",
    annual_fee: 0,
    foreign_tx_fee_pct: 0,
    points_program_id: "cashback",
    earn_rules: [
      { category: "hotels", multiplier: 0.05, note: "via Capital One Travel" },
      { category: "groceries", multiplier: 0.03 },
      { category: "dining", multiplier: 0.03 },
      { category: "entertainment", multiplier: 0.03 },
      { category: "streaming", multiplier: 0.03 },
      { category: "everything_else", multiplier: 0.01 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.capitalone.com/credit-cards/savor/",
  },
  {
    id: "discover_it_cash_back",
    issuer: "Discover",
    name: "it Cash Back",
    annual_fee: 0,
    foreign_tx_fee_pct: 0,
    points_program_id: "cashback",
    earn_rules: [
      {
        category: "rotating_5pct",
        multiplier: 0.05,
        cap_period_spend: 1500,
        cap_period: "quarterly",
        note: "rotating quarterly categories, 5% up to $1,500/qtr",
      },
      { category: "everything_else", multiplier: 0.01 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.discover.com/credit-cards/cash-back/it-card/",
  },
  {
    id: "boa_customized_cash",
    issuer: "Bank of America",
    name: "Customized Cash Rewards",
    annual_fee: 0,
    foreign_tx_fee_pct: 3,
    points_program_id: "cashback",
    earn_rules: [
      {
        category: "choose_category",
        multiplier: 0.03,
        cap_period_spend: 2500,
        cap_period: "quarterly",
        note: "combined quarterly cap $2,500 across 3% choice + 2% grocery/wholesale",
      },
      { category: "groceries", multiplier: 0.02 },
      { category: "wholesale_clubs", multiplier: 0.02 },
      { category: "everything_else", multiplier: 0.01 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source:
      "https://www.bankofamerica.com/credit-cards/products/cash-back-credit-card/cash-back-category-choices/",
  },
  {
    id: "boa_premium_rewards",
    issuer: "Bank of America",
    name: "Premium Rewards",
    annual_fee: 95,
    foreign_tx_fee_pct: 0,
    points_program_id: "cashback",
    earn_rules: [
      { category: "travel", multiplier: 0.02 },
      { category: "dining", multiplier: 0.02 },
      { category: "everything_else", multiplier: 0.015 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.bankofamerica.com/credit-cards/products/premium-rewards-credit-card/",
  },
  {
    id: "wf_active_cash",
    issuer: "Wells Fargo",
    name: "Active Cash",
    annual_fee: 0,
    foreign_tx_fee_pct: 3,
    points_program_id: "cashback",
    earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://creditcards.wellsfargo.com/active-cash-credit-card/",
  },
  {
    id: "wf_autograph",
    issuer: "Wells Fargo",
    name: "Autograph",
    annual_fee: 0,
    foreign_tx_fee_pct: 3,
    points_program_id: "cashback",
    earn_rules: [
      { category: "dining", multiplier: 3 },
      { category: "travel", multiplier: 3 },
      { category: "gas", multiplier: 3 },
      { category: "transit", multiplier: 3 },
      { category: "streaming", multiplier: 3 },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://cardbenefits.wf.com/product/visa_autograph/",
  },
  {
    id: "usbank_altitude_go",
    issuer: "US Bank",
    name: "Altitude Go",
    annual_fee: 0,
    foreign_tx_fee_pct: 3,
    points_program_id: "cashback",
    earn_rules: [
      { category: "dining", multiplier: 0.04, cap_period_spend: 2000, cap_period: "quarterly" },
      { category: "groceries", multiplier: 0.02 },
      { category: "gas", multiplier: 0.02 },
      { category: "streaming", multiplier: 0.02 },
      { category: "everything_else", multiplier: 0.01 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source:
      "https://www.usbank.com/credit-cards/offers/altitude-go-visa-signature-credit-card.html",
  },
  {
    id: "bilt_mastercard",
    issuer: "Bilt",
    name: "Mastercard",
    annual_fee: 0,
    foreign_tx_fee_pct: 0,
    points_program_id: "bilt",
    earn_rules: [
      { category: "dining", multiplier: 3 },
      { category: "hotels", multiplier: 3, note: "via Bilt Travel" },
      { category: "flights", multiplier: 2, note: "via Bilt Travel" },
      { category: "rent", multiplier: 1, note: "no transaction fee up to 100k pts/yr" },
      { category: "everything_else", multiplier: 1 },
    ],
    rates_verified_on: RATES_VERIFIED_ON,
    source: "https://www.bilt.com/card",
    notes:
      "Bilt Blue tier (2026 relaunch). Higher tiers exist for annual-fee variants; this row reflects the free base card.",
  },
];

export const CATALOG_BY_ID: Record<string, CatalogCard> = Object.fromEntries(
  CARD_CATALOG.map((c) => [c.id, c]),
);

export function catalogGroupedByIssuer(cards: CatalogCard[] = CARD_CATALOG): {
  issuer: string;
  cards: CatalogCard[];
}[] {
  const map = new Map<string, CatalogCard[]>();
  for (const c of cards) {
    const bucket = map.get(c.issuer) ?? [];
    bucket.push(c);
    map.set(c.issuer, bucket);
  }
  return Array.from(map.entries())
    .map(([issuer, cs]) => ({
      issuer,
      cards: cs.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.issuer.localeCompare(b.issuer));
}
