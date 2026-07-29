import {
  recommend,
  resolveEarnRule,
  type EngineCard,
  type EngineOffer,
  type EarnRule,
} from "./recommendationEngine";
import {
  applyUtilization,
  type AccountSnapshot,
  type UtilizationBehavior,
} from "./utilizationFilter";

export const CHEAT_SHEET_CATEGORIES = [
  { id: "dining", label: "Dining", hint: "Restaurants, cafés, and takeout" },
  { id: "groceries", label: "Groceries", hint: "U.S. supermarkets" },
  { id: "gas", label: "Gas & EV", hint: "Fuel and charging" },
  { id: "flights", label: "Flights", hint: "Airfare and airline purchases" },
  { id: "hotels", label: "Hotels", hint: "Hotel stays and bookings" },
  { id: "travel", label: "Other travel", hint: "Transit, rental cars, and general travel" },
  { id: "drugstores", label: "Drugstores", hint: "Pharmacies and drugstores" },
  { id: "streaming", label: "Streaming", hint: "Eligible streaming services" },
  { id: "online_shopping", label: "Online shopping", hint: "General online retail" },
  { id: "everything_else", label: "Everything else", hint: "Your dependable catch-all" },
] as const;

export type CheatSheetPick = {
  categoryId: string;
  category: string;
  hint: string;
  cards: EngineCard[];
  cardLabel: string;
  issuerLabel: string;
  rateLabel: string;
  valueLabel: string;
  exception: string | null;
};

function formatRate(rule: EarnRule) {
  return rule.multiplier < 1
    ? `${Math.round(rule.multiplier * 100)}% back`
    : `${rule.multiplier}× points`;
}

function exceptionLabel(rule: EarnRule, capNotes: string[]) {
  const details = [...new Set(capNotes)];
  if (rule.note) details.push(rule.note);
  return details.length ? details.join(" · ") : null;
}

/**
 * Build the playbook with the same deterministic engine used by Plan.
 * The representative $100 purchase makes the estimated return easy to read;
 * merchant-specific offers are intentionally excluded when no merchant is known.
 */
export function buildCheatSheetPicks({
  wallet,
  offers,
  valuations,
  capReachedCategoriesByCard,
  utilization,
  amountCents = 10_000,
}: {
  wallet: EngineCard[];
  offers: EngineOffer[];
  valuations: Record<string, number>;
  capReachedCategoriesByCard?: Record<string, string[]>;
  utilization?: {
    enabled: boolean;
    accountsByUserCardId: Record<string, AccountSnapshot>;
    threshold: number;
    behavior: UtilizationBehavior;
    perCardOverrides?: Record<string, number>;
  };
  amountCents?: number;
}): CheatSheetPick[] {
  return CHEAT_SHEET_CATEGORIES.flatMap((category) => {
    const result = recommend({
      amountCents,
      category: category.id,
      wallet,
      offers,
      valuations,
      capReachedCategoriesByCard,
    });
    const utilizationResult =
      utilization?.enabled && result.winner
        ? applyUtilization({
            engineOutput: result,
            accountsByUserCardId: utilization.accountsByUserCardId,
            threshold: utilization.threshold,
            behavior: utilization.behavior,
            perCardOverrides: utilization.perCardOverrides,
          })
        : null;
    const winner =
      utilizationResult?.behaviorApplied === "reranked" ? utilizationResult.winner : result.winner;
    if (!winner) return [];

    const cards = winner.legs
      .map((leg) => wallet.find((card) => card.id === leg.userCardId))
      .filter((card): card is EngineCard => Boolean(card));
    if (!cards.length) return [];

    const primaryRule = resolveEarnRule(cards[0], category.id);
    const capReached =
      capReachedCategoriesByCard?.[cards[0].id]?.includes(primaryRule.category) ?? false;
    const fallbackRule =
      cards[0].earn_rules.find((rule) => rule.category === "everything_else") ??
      cards[0].earn_rules.find((rule) => rule.category === "all") ??
      primaryRule;
    const displayedRule = capReached
      ? {
          ...primaryRule,
          multiplier: primaryRule.post_cap_multiplier ?? fallbackRule.multiplier,
        }
      : primaryRule;
    const creditException =
      utilizationResult?.behaviorApplied === "reranked"
        ? "Credit health: re-ranked to stay under your comfort level"
        : utilizationResult?.behaviorApplied === "split-suggested"
          ? "Credit health: consider splitting to stay under your comfort level"
          : utilizationResult?.behaviorApplied === "warn"
            ? "Credit health: this example goes above your comfort level"
            : null;
    const returnPct = (winner.totalValueCents / amountCents) * 100;
    const cardLabel =
      winner.kind === "split"
        ? winner.legs.map((leg) => leg.cardLabel).join(" + ")
        : cards[0].nickname || cards[0].name;

    return [
      {
        categoryId: category.id,
        category: category.label,
        hint: category.hint,
        cards,
        cardLabel,
        issuerLabel: winner.kind === "split" ? "Split purchase" : cards[0].issuer,
        rateLabel: winner.kind === "split" ? "2-card split" : formatRate(displayedRule),
        valueLabel: `${returnPct.toFixed(returnPct >= 10 ? 0 : 1)}% estimated value`,
        exception: exceptionLabel(displayedRule, [
          ...(creditException ? [creditException] : []),
          ...(capReached ? ["Bonus cap marked reached; showing the post-cap rate"] : []),
          ...winner.legs.flatMap((leg) => (leg.capNote ? [leg.capNote] : [])),
        ]),
      },
    ];
  });
}
