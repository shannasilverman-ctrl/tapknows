import type { Play as PlannerPlay } from "./planner";
import type { EngineOutput, Play as EnginePlay } from "./recommendationEngine";
import {
  applyUtilization,
  type AccountSnapshot,
  type UtilizationBehavior,
  type UtilizationNote,
} from "./utilizationFilter";

export type DecideUtilizationInput = {
  plays: PlannerPlay[];
  accountsByUserCardId: Record<string, AccountSnapshot>;
  threshold: number;
  behavior: UtilizationBehavior;
  perCardOverrides?: Record<string, number>;
};

export type DecideUtilizationResult = {
  plays: PlannerPlay[];
  behaviorApplied: "none" | "warn" | "reranked" | "split-suggested";
  caution: string | null;
};

function cardLabel(play: PlannerPlay, legIndex: number): string {
  const leg = play.legs[legIndex];
  return leg.nickname ?? `${leg.card.issuer} ${leg.card.name}`;
}

function toEnginePlay(play: PlannerPlay): EnginePlay {
  return {
    kind: play.kind,
    totalValueCents: play.totalValueCents,
    headline: play.headline,
    legs: play.legs.map((leg, index) => ({
      userCardId: leg.userCardId,
      cardLabel: cardLabel(play, index),
      amountCents: leg.amountCents,
      baseEarnCents: leg.rewardsCents,
      offerValueCents: Math.max(0, leg.valueCents - leg.rewardsCents),
      reason: leg.reasoning,
    })),
  };
}

function highestProjected(notes: UtilizationNote[]): UtilizationNote | null {
  return (
    notes
      .filter((note) => note.projectedPct != null)
      .sort((a, b) => (b.projectedPct ?? 0) - (a.projectedPct ?? 0))[0] ?? null
  );
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Applies the canonical credit-health policy to Planner plays without
 * recalculating rewards. Object identity maps every canonical result back to
 * the exact Planner play that produced it.
 */
export function applyDecideUtilization(input: DecideUtilizationInput): DecideUtilizationResult {
  if (input.plays.length === 0) {
    return { plays: input.plays, behaviorApplied: "none", caution: null };
  }

  const plannerByEngine = new Map<EnginePlay, PlannerPlay>();
  const rankedPlays = input.plays.map((play) => {
    const enginePlay = toEnginePlay(play);
    plannerByEngine.set(enginePlay, play);
    return enginePlay;
  });
  const engineOutput: EngineOutput = {
    winner: rankedPlays[0] ?? null,
    runnerUp: rankedPlays[1] ?? null,
    rankedPlays,
    dollarDeltaCents:
      rankedPlays.length > 1 ? rankedPlays[0].totalValueCents - rankedPlays[1].totalValueCents : 0,
    explanation: rankedPlays[0]?.headline ?? "",
    mathTable: [],
  };
  const result = applyUtilization({
    engineOutput,
    accountsByUserCardId: input.accountsByUserCardId,
    threshold: input.threshold,
    behavior: input.behavior,
    perCardOverrides: input.perCardOverrides,
  });

  if (result.behaviorApplied === "reranked" && result.winner) {
    const promoted = plannerByEngine.get(result.winner);
    if (promoted) {
      return {
        plays: [promoted, ...input.plays.filter((play) => play !== promoted)],
        behaviorApplied: "reranked",
        caution: `Re-ranked to ${cardLabel(promoted, 0)} to stay within your saved utilization target.`,
      };
    }
  }

  if (result.behaviorApplied === "split-suggested" && result.splitSuggestion) {
    const savedSplit = plannerByEngine.get(result.splitSuggestion);
    const description = savedSplit
      ? savedSplit.legs
          .map(
            (leg) =>
              `${formatDollars(leg.amountCents)} on ${leg.nickname ?? `${leg.card.issuer} ${leg.card.name}`}`,
          )
          .join(" and ")
      : result.splitSuggestion.legs
          .map((leg) => `${formatDollars(leg.amountCents)} on ${leg.cardLabel}`)
          .join(" and ");
    return {
      plays: input.plays,
      behaviorApplied: "split-suggested",
      caution: `To stay within your saved utilization target, consider ${description}.`,
    };
  }

  if (result.behaviorApplied === "warn") {
    const projected = highestProjected(result.notes);
    return {
      plays: input.plays,
      behaviorApplied: "warn",
      caution: projected?.projectedPct
        ? `${projected.cardLabel} would reach about ${pct(projected.projectedPct)} utilization, above your ${pct(projected.effectiveThreshold)} target.`
        : "This purchase may exceed your saved utilization target.",
    };
  }

  return { plays: input.plays, behaviorApplied: "none", caution: null };
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
