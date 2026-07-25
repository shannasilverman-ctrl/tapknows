import { describe, expect, it } from "vitest";
import { applyUtilization, type UtilizationInput } from "./utilizationFilter";
import type { EngineOutput, Play } from "./recommendationEngine";

function singlePlay(cardId: string, label: string, amountCents: number, value: number): Play {
  return {
    kind: "single",
    totalValueCents: value,
    headline: `single on ${label}`,
    legs: [
      {
        userCardId: cardId,
        cardLabel: label,
        amountCents,
        baseEarnCents: value,
        offerValueCents: 0,
        reason: "base",
      },
    ],
  };
}

function output(winner: Play, runnerUp: Play | null = null): EngineOutput {
  return {
    winner,
    runnerUp,
    dollarDeltaCents: runnerUp ? winner.totalValueCents - runnerUp.totalValueCents : 0,
    explanation: winner.headline,
    mathTable: [],
  };
}

describe("utilizationFilter", () => {
  it("no-op when winner projected utilization is under threshold", () => {
    const inp: UtilizationInput = {
      engineOutput: output(singlePlay("c1", "Card 1", 5000, 500)), // $50 charge
      accountsByUserCardId: { c1: { limitCents: 1_000_000, balanceCents: 20_000 } }, // 2% + 0.5% = 2.5%
      threshold: 0.1,
      behavior: "warn",
    };
    const r = applyUtilization(inp);
    expect(r.behaviorApplied).toBe("none");
    expect(r.notes[0].overThreshold).toBe(false);
    expect(r.winner).toBe(inp.engineOutput.winner);
  });

  it("warn behavior attaches notes but keeps winner", () => {
    const inp: UtilizationInput = {
      engineOutput: output(singlePlay("c1", "Card 1", 40_000, 400)), // $400 charge
      accountsByUserCardId: { c1: { limitCents: 100_000, balanceCents: 0 } }, // 40% projected
      threshold: 0.1,
      behavior: "warn",
    };
    const r = applyUtilization(inp);
    expect(r.behaviorApplied).toBe("warn");
    expect(r.winner).toBe(inp.engineOutput.winner);
    expect(r.notes[0].overThreshold).toBe(true);
    expect(r.notes[0].projectedPct).toBeCloseTo(0.4);
  });

  it("rerank swaps to compliant runner-up when winner breaches", () => {
    const winner = singlePlay("c1", "Card 1", 40_000, 500);
    const runnerUp = singlePlay("c2", "Card 2", 40_000, 480);
    const inp: UtilizationInput = {
      engineOutput: output(winner, runnerUp),
      accountsByUserCardId: {
        c1: { limitCents: 100_000, balanceCents: 0 }, // 40%
        c2: { limitCents: 1_000_000, balanceCents: 0 }, // 4%
      },
      threshold: 0.1,
      behavior: "rerank",
    };
    const r = applyUtilization(inp);
    expect(r.behaviorApplied).toBe("reranked");
    expect(r.winner).toBe(runnerUp);
    expect(r.originalWinner).toBe(winner);
  });

  it("rerank falls back to warn when no compliant alternative exists", () => {
    const winner = singlePlay("c1", "Card 1", 40_000, 500);
    const runnerUp = singlePlay("c2", "Card 2", 40_000, 480);
    const inp: UtilizationInput = {
      engineOutput: output(winner, runnerUp),
      accountsByUserCardId: {
        c1: { limitCents: 100_000, balanceCents: 0 }, // 40%
        c2: { limitCents: 100_000, balanceCents: 0 }, // 40%
      },
      threshold: 0.1,
      behavior: "rerank",
    };
    const r = applyUtilization(inp);
    expect(r.behaviorApplied).toBe("warn");
    expect(r.winner).toBe(winner);
  });

  it("split behavior suggests a two-card split that keeps each leg under the cap", () => {
    const winner = singlePlay("c1", "Card 1", 40_000, 500);
    const runnerUp = singlePlay("c2", "Card 2", 40_000, 480);
    const inp: UtilizationInput = {
      engineOutput: output(winner, runnerUp),
      accountsByUserCardId: {
        c1: { limitCents: 200_000, balanceCents: 0 }, // room for $200 at 10%
        c2: { limitCents: 1_000_000, balanceCents: 0 },
      },
      threshold: 0.1,
      behavior: "split",
    };
    const r = applyUtilization(inp);
    expect(r.behaviorApplied).toBe("split-suggested");
    expect(r.splitSuggestion).not.toBeNull();
    expect(r.splitSuggestion!.legs).toHaveLength(2);
    expect(r.splitSuggestion!.legs[0].amountCents).toBe(20_000); // $200 max on c1 at 10%
    expect(r.splitSuggestion!.legs[1].amountCents).toBe(20_000);
  });

  it("split degrades to warn when no viable split exists", () => {
    const winner = singlePlay("c1", "Card 1", 40_000, 500);
    const runnerUp = singlePlay("c2", "Card 2", 40_000, 480);
    const inp: UtilizationInput = {
      engineOutput: output(winner, runnerUp),
      accountsByUserCardId: {
        c1: { limitCents: 100_000, balanceCents: 100_000 }, // maxed
        c2: { limitCents: 100_000, balanceCents: 100_000 },
      },
      threshold: 0.1,
      behavior: "split",
    };
    const r = applyUtilization(inp);
    expect(r.behaviorApplied).toBe("warn");
    expect(r.splitSuggestion).toBeNull();
  });

  it("per-card override raises the cap for that card only", () => {
    const winner = singlePlay("c1", "Card 1", 40_000, 500);
    const inp: UtilizationInput = {
      engineOutput: output(winner),
      accountsByUserCardId: { c1: { limitCents: 100_000, balanceCents: 0 } }, // 40%
      threshold: 0.1,
      behavior: "warn",
      perCardOverrides: { c1: 0.5 },
    };
    const r = applyUtilization(inp);
    expect(r.behaviorApplied).toBe("none");
    expect(r.notes[0].overThreshold).toBe(false);
    expect(r.notes[0].effectiveThreshold).toBe(0.5);
  });

  it("cards with unknown limit are treated as unconstrained", () => {
    const winner = singlePlay("c1", "Card 1", 40_000, 500);
    const inp: UtilizationInput = {
      engineOutput: output(winner),
      accountsByUserCardId: {}, // no snapshot at all
      threshold: 0.1,
      behavior: "rerank",
    };
    const r = applyUtilization(inp);
    expect(r.behaviorApplied).toBe("none");
    expect(r.notes[0].limitKnown).toBe(false);
  });

  it("empty engine output returns null winner and no behavior", () => {
    const inp: UtilizationInput = {
      engineOutput: {
        winner: null,
        runnerUp: null,
        dollarDeltaCents: 0,
        explanation: "",
        mathTable: [],
      },
      accountsByUserCardId: {},
      threshold: 0.1,
      behavior: "warn",
    };
    const r = applyUtilization(inp);
    expect(r.winner).toBeNull();
    expect(r.behaviorApplied).toBe("none");
  });
});
