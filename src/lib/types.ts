export type EarnRule = {
  category: string;
  multiplier: number;
  // Cap fields. The catalog has always carried these (see CatalogEarnRule in
  // cardCatalog.ts) and decide.tsx passes `earn_rules` through by reference,
  // so they were present at runtime the whole time — this type just did not
  // declare them. That omission is why the planner path was cap-blind while
  // the engine path was not: the type system hid the data from one consumer
  // and not the other. Declaring them keeps the two in step.
  cap_period_spend?: number;
  cap_annual_spend?: number; // legacy alias — the engine reads either
  cap_period?: "annual" | "quarterly" | "monthly";
  // Explicit post-cap rate. When omitted, earning falls back to the card's
  // everything_else / all base rule.
  post_cap_multiplier?: number;
  note?: string;
};

export type CardCatalog = {
  id: string;
  issuer: string;
  name: string;
  annual_fee: number;
  points_program_id: string | null;
  foreign_tx_fee_pct: number;
  earn_rules: EarnRule[];
  notes: string | null;
};

export type PointsProgram = {
  id: string;
  name: string;
  kind: "transferable" | "airline" | "hotel" | "cashback" | "fixed";
  default_cpp: number;
};

export type MerchantCatalog = {
  id: string;
  name: string;
  category: string;
  aliases: string[];
};

export type UserCard = {
  id: string;
  user_id: string;
  card_catalog_id: string;
  nickname: string | null;
  opened_at: string | null;
  annual_fee_paid_at: string | null;
  created_at: string;
};

export type UserOffer = {
  id: string;
  user_id: string;
  user_card_id: string;
  merchant_catalog_id: string | null;
  merchant_text: string;
  reward_type: "multiplier" | "percent_back" | "statement_credit";
  reward_value: number;
  min_spend: number;
  expires_at: string | null;
};

export type UserSignupBonus = {
  id: string;
  user_id: string;
  user_card_id: string;
  bonus_points: number;
  spend_required: number;
  spend_so_far: number;
  deadline: string;
};

export type UserBalance = {
  id: string;
  user_id: string;
  points_program_id: string;
  balance: number;
  updated_at: string;
};

export type Recommendation = {
  userCardId: string;
  card: CardCatalog;
  nickname: string | null;
  multiplier: number;
  pointsEarned: number;
  cpp: number;
  valueCents: number;
  rewardKind: "points" | "cashback" | "credit";
  matchedCategory: string;
  reasoning: string;
  offerApplied?: UserOffer;
  foreignTxPenaltyCents: number;
};
