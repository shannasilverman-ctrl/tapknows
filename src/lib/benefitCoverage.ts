// Benefit coverage state.
//
// HONESTY RULE (mirrors the one in `benefits.ts`): an empty benefit list means
// TAP has not verified this card's benefits yet — it never means the card has
// no benefits. Every surface that renders benefits must say which of the two
// it is looking at, so a customer is never told "nothing here" when the truth
// is "we have not checked yet".

import { BENEFITS_BY_CARD } from "@/lib/benefits";

export type BenefitCoverage = "verified" | "not_yet_verified";

/** The exact copy shown wherever a card's benefits are unverified. Never improvised. */
export const UNVERIFIED_COPY = "Not yet verified in TAP";

/**
 * Whether TAP carries sourced benefit rows for a catalog card.
 *
 * A card counts as `verified` only when at least one registry row cites an
 * https source — an uncited row is not evidence, so it cannot make a card
 * verified.
 */
export function benefitCoverage(cardId: string): BenefitCoverage {
  const rows = BENEFITS_BY_CARD[cardId];
  if (!rows || rows.length === 0) return "not_yet_verified";
  const sourced = rows.some((b) => {
    const url = b.source_url ?? b.source;
    return typeof url === "string" && url.startsWith("https://");
  });
  return sourced ? "verified" : "not_yet_verified";
}

/** Convenience predicate for render paths that only need the boolean. */
export function isBenefitVerified(cardId: string): boolean {
  return benefitCoverage(cardId) === "verified";
}
