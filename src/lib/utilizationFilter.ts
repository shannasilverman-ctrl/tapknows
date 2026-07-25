// Pure utilization filter. Wraps EngineOutput; never mutates the engine's math.
// All monetary math in integer cents. Utilization expressed as a fraction 0..1
// (10% = 0.10) internally; UI converts to percent for display.

import type { EngineOutput, MathRow, Play } from "./recommendationEngine";

export type AccountSnapshot = {
  limitCents: number;
  balanceCents: number;
};

export type UtilizationBehavior = "warn" | "rerank" | "split";

export type UtilizationInput = {
  engineOutput: EngineOutput;
  accountsByUserCardId: Record<string, AccountSnapshot>;
  threshold: number; // 0..1
  behavior: UtilizationBehavior;
  perCardOverrides?: Record<string, number>; // 0..1
};

export type UtilizationNote = {
  userCardId: string;
  cardLabel: string;
  currentPct: number | null; // null when limit unknown
  projectedPct: number | null;
  effectiveThreshold: number;
  overThreshold: boolean;
  limitKnown: boolean;
};

export type UtilizationOutput = {
  winner: Play | null;
  runnerUp: Play | null;
  notes: UtilizationNote[];
  behaviorApplied: "none" | "warn" | "reranked" | "split-suggested";
  originalWinner: Play | null; // when rerank/split changed the pick
  splitSuggestion: Play | null;
};

function pctForLeg(
  cardId: string,
  legCents: number,
  accounts: Record<string, AccountSnapshot>,
): { current: number | null; projected: number | null; limitKnown: boolean } {
  const acc = accounts[cardId];
  if (!acc || acc.limitCents <= 0) {
    return { current: null, projected: null, limitKnown: false };
  }
  return {
    current: acc.balanceCents / acc.limitCents,
    projected: (acc.balanceCents + legCents) / acc.limitCents,
    limitKnown: true,
  };
}

function effectiveThresholdFor(
  cardId: string,
  threshold: number,
  overrides?: Record<string, number>,
): number {
  const o = overrides?.[cardId];
  return o != null ? o : threshold;
}

function notesForPlay(play: Play, input: UtilizationInput): UtilizationNote[] {
  return play.legs.map((leg) => {
    const t = effectiveThresholdFor(leg.userCardId, input.threshold, input.perCardOverrides);
    const { current, projected, limitKnown } = pctForLeg(
      leg.userCardId,
      leg.amountCents,
      input.accountsByUserCardId,
    );
    return {
      userCardId: leg.userCardId,
      cardLabel: leg.cardLabel,
      currentPct: current,
      projectedPct: projected,
      effectiveThreshold: t,
      overThreshold: limitKnown && projected != null && projected > t,
      limitKnown,
    };
  });
}

function playIsCompliant(play: Play, input: UtilizationInput): boolean {
  for (const leg of play.legs) {
    const t = effectiveThresholdFor(leg.userCardId, input.threshold, input.perCardOverrides);
    const acc = input.accountsByUserCardId[leg.userCardId];
    if (!acc || acc.limitCents <= 0) continue; // unknown limit is not blocking
    const projected = (acc.balanceCents + leg.amountCents) / acc.limitCents;
    if (projected > t) return false;
  }
  return true;
}

// Map math-table rows back to plays. The engine builds plays and mathTable in
// lockstep, but the wrapper only receives winner/runnerUp typed. To synthesize
// alternate plays for rerank, we accept the original plays via a helper on
// EngineOutput's cached data. The engine currently exposes only winner and
// runnerUp Play objects, so rerank considers those two — sufficient for the
// warn/rerank/split behaviors defined in the plan.

function findSplitFromWinnerAndRunnerUp(
  winner: Play,
  runnerUp: Play | null,
  input: UtilizationInput,
): Play | null {
  // If runnerUp is a split that is compliant, prefer it.
  if (runnerUp && runnerUp.kind === "split" && playIsCompliant(runnerUp, input)) {
    return runnerUp;
  }
  // Otherwise synthesize a split by pairing winner's card with runnerUp's card
  // if amounts and limits permit. We keep this deliberately narrow: only when
  // the winner is single-card and a distinct second card exists in runnerUp.
  if (winner.kind !== "single" || !runnerUp) return null;
  const primary = winner.legs[0];
  const secondary = runnerUp.legs.find((l) => l.userCardId !== primary.userCardId);
  if (!secondary) return null;
  const total = primary.amountCents;
  const primaryAcc = input.accountsByUserCardId[primary.userCardId];
  const secondaryAcc = input.accountsByUserCardId[secondary.userCardId];
  const tA = effectiveThresholdFor(primary.userCardId, input.threshold, input.perCardOverrides);
  const tB = effectiveThresholdFor(secondary.userCardId, input.threshold, input.perCardOverrides);
  if (!primaryAcc || primaryAcc.limitCents <= 0) return null;
  // Room on primary before breaching cap:
  const maxA = Math.max(0, Math.floor(primaryAcc.limitCents * tA) - primaryAcc.balanceCents);
  if (maxA <= 0) return null;
  const portionA = Math.min(total, maxA);
  const portionB = total - portionA;
  if (portionB <= 0) return null;
  if (secondaryAcc && secondaryAcc.limitCents > 0) {
    const projB = (secondaryAcc.balanceCents + portionB) / secondaryAcc.limitCents;
    if (projB > tB) return null;
  }
  // Value-preserving heuristic: earn scales with amount for both legs, so we
  // approximate value by the per-dollar rate implied by each play's totals.
  const winnerPerCent = winner.totalValueCents / winner.legs[0].amountCents;
  const secondPerCent =
    runnerUp.totalValueCents / runnerUp.legs.reduce((s, l) => s + l.amountCents, 0);
  const estValue = Math.round(portionA * winnerPerCent + portionB * secondPerCent);
  return {
    kind: "split",
    totalValueCents: estValue,
    headline: `Split ${cents(portionA)} on ${primary.cardLabel} and ${cents(portionB)} on ${secondary.cardLabel} to stay under the cap.`,
    legs: [
      {
        userCardId: primary.userCardId,
        cardLabel: primary.cardLabel,
        amountCents: portionA,
        baseEarnCents: Math.round(primary.baseEarnCents * (portionA / total)),
        offerValueCents: 0,
        reason: "stay under cap",
      },
      {
        userCardId: secondary.userCardId,
        cardLabel: secondary.cardLabel,
        amountCents: portionB,
        baseEarnCents: Math.round(
          secondary.baseEarnCents * (portionB / (runnerUp.legs[0]?.amountCents || total)),
        ),
        offerValueCents: 0,
        reason: "remaining amount",
      },
    ],
  };
}

function cents(c: number): string {
  const whole = Math.floor(c / 100);
  const frac = c % 100;
  return frac === 0 ? `$${whole}` : `$${whole}.${String(frac).padStart(2, "0")}`;
}

export function applyUtilization(input: UtilizationInput): UtilizationOutput {
  const { engineOutput, behavior } = input;
  const winner = engineOutput.winner;
  const runnerUp = engineOutput.runnerUp;

  if (!winner) {
    return {
      winner: null,
      runnerUp: null,
      notes: [],
      behaviorApplied: "none",
      originalWinner: null,
      splitSuggestion: null,
    };
  }

  const winnerNotes = notesForPlay(winner, input);
  const anyOver = winnerNotes.some((n) => n.overThreshold);

  if (!anyOver) {
    return {
      winner,
      runnerUp,
      notes: winnerNotes,
      behaviorApplied: "none",
      originalWinner: null,
      splitSuggestion: null,
    };
  }

  if (behavior === "warn") {
    return {
      winner,
      runnerUp,
      notes: winnerNotes,
      behaviorApplied: "warn",
      originalWinner: null,
      splitSuggestion: null,
    };
  }

  if (behavior === "rerank") {
    // Prefer runnerUp if it's compliant; otherwise fall back to winner + warn.
    if (runnerUp && playIsCompliant(runnerUp, input)) {
      return {
        winner: runnerUp,
        runnerUp: winner,
        notes: notesForPlay(runnerUp, input),
        behaviorApplied: "reranked",
        originalWinner: winner,
        splitSuggestion: null,
      };
    }
    return {
      winner,
      runnerUp,
      notes: winnerNotes,
      behaviorApplied: "warn",
      originalWinner: null,
      splitSuggestion: null,
    };
  }

  // behavior === "split"
  const split = findSplitFromWinnerAndRunnerUp(winner, runnerUp, input);
  if (split) {
    return {
      winner,
      runnerUp,
      notes: winnerNotes,
      behaviorApplied: "split-suggested",
      originalWinner: null,
      splitSuggestion: split,
    };
  }
  return {
    winner,
    runnerUp,
    notes: winnerNotes,
    behaviorApplied: "warn",
    originalWinner: null,
    splitSuggestion: null,
  };
}

// Silences unused-type warnings while keeping the shape available for callers.
export type _MathRow = MathRow;
