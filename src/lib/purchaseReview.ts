import type { PlayLeg } from "./recommendationEngine";

const CATEGORY_ALIASES: Record<string, string> = {
  all: "everything_else",
  other: "everything_else",
  drugstore: "drugstores",
  online: "online_shopping",
  hotel: "hotels",
  airline: "flights",
};

/** Normalize legacy/manual category values before they reach the reward engine. */
export function canonicalPurchaseCategory(category: string): string {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, "_");
  return CATEGORY_ALIASES[normalized] ?? normalized;
}

/**
 * Recover base points from the engine's value result.
 *
 * `baseEarnCents` is already cap-aware and uses the customer's cents-per-point
 * valuation. Offer value is intentionally excluded because a statement credit
 * must never be written into a points balance.
 */
export function earnedPointsFromEngineLeg(leg: PlayLeg, cppCents: number): number {
  if (!Number.isFinite(cppCents) || cppCents <= 0 || leg.baseEarnCents <= 0) return 0;
  return Math.max(0, Math.round(leg.baseEarnCents / cppCents));
}
