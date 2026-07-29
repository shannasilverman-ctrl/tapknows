import { describe, expect, it } from "vitest";
import type { Play } from "./planner";
import { applyDecideUtilization } from "./decideUtilization";

function play(id: string, value: number, amountCents = 40_000): Play {
  return {
    id,
    kind: "single",
    totalValueCents: value,
    headline: id,
    programIdsUsed: ["cashback"],
    legs: [
      {
        userCardId: id,
        card: {
          id,
          issuer: "Test",
          name: `Card ${id}`,
          annual_fee: 0,
          points_program_id: "cashback",
          foreign_tx_fee_pct: 0,
          earn_rules: [{ category: "all", multiplier: 0.02 }],
          notes: null,
        },
        nickname: null,
        amountCents,
        earnMultiplier: 0.02,
        matchedCategory: "everything",
        valueCents: value,
        rewardsCents: value,
        reasoning: "2% back",
        rewardKind: "cashback",
        pointsEarned: 0,
        cpp: 0.01,
        programId: "cashback",
      },
    ],
  };
}

describe("applyDecideUtilization", () => {
  it("reranks across the full list, not only the runner-up", () => {
    const first = play("one", 800);
    const second = play("two", 700);
    const third = play("three", 600);
    const result = applyDecideUtilization({
      plays: [first, second, third],
      accountsByUserCardId: {
        one: { limitCents: 100_000, balanceCents: 0 },
        two: { limitCents: 100_000, balanceCents: 0 },
        three: { limitCents: 1_000_000, balanceCents: 0 },
      },
      threshold: 0.1,
      behavior: "rerank",
    });

    expect(result.behaviorApplied).toBe("reranked");
    expect(result.plays[0]).toBe(third);
    expect(result.caution).toContain("saved utilization target");
  });

  it("keeps the reward ranking and reports exact projected utilization in warn mode", () => {
    const winner = play("one", 800);
    const result = applyDecideUtilization({
      plays: [winner],
      accountsByUserCardId: {
        one: { limitCents: 100_000, balanceCents: 10_000 },
      },
      threshold: 0.1,
      behavior: "warn",
    });

    expect(result.plays[0]).toBe(winner);
    expect(result.behaviorApplied).toBe("warn");
    expect(result.caution).toContain("50% utilization");
    expect(result.caution).toContain("10% target");
  });

  it("does nothing when credit-health guidance is safely under target", () => {
    const winner = play("one", 800, 5_000);
    const result = applyDecideUtilization({
      plays: [winner],
      accountsByUserCardId: {
        one: { limitCents: 1_000_000, balanceCents: 10_000 },
      },
      threshold: 0.1,
      behavior: "warn",
    });

    expect(result.behaviorApplied).toBe("none");
    expect(result.caution).toBeNull();
  });
});
