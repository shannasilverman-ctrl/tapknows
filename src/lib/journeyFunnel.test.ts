// Executable proof for JR-1: pure funnel arithmetic over plain event rows.
//
// Pinned semantics: distinct client_id per step, canonical funnel order,
// repeated events from one client count once, non-funnel rows are ignored,
// no temporal ordering is required between steps, dropOff is null on the
// first step and whenever the previous step's count is zero, otherwise
// max(0, 1 - count / prevCount).

import { describe, expect, it } from "vitest";
import { computeJourneyFunnel, type JourneyFunnelRow } from "./journeyFunnel";

const DECISION_FUNNEL_ORDER = [
  "wallet_ready",
  "merchant_selected",
  "recommendation_viewed",
  "proof_opened",
  "payment_choice_recorded",
] as const;

function rows(pairs: Array<[string, string]>): JourneyFunnelRow[] {
  return pairs.map(([client_id, name]) => ({ client_id, name }));
}

describe("computeJourneyFunnel", () => {
  it("returns exactly five steps in canonical funnel order", () => {
    const out = computeJourneyFunnel([]);
    expect(out).toHaveLength(5);
    expect(out.map((s) => s.step)).toEqual([...DECISION_FUNNEL_ORDER]);
  });

  it("counts a client once per step no matter how many times it repeats the event", () => {
    const out = computeJourneyFunnel(
      rows([
        ["c1", "wallet_ready"],
        ["c1", "wallet_ready"],
        ["c1", "wallet_ready"],
      ]),
    );
    expect(out[0]).toEqual({ step: "wallet_ready", count: 1, dropOff: null });
  });

  it("counts distinct clients per step across multiple clients", () => {
    const out = computeJourneyFunnel(
      rows([
        ["c1", "wallet_ready"],
        ["c2", "wallet_ready"],
        ["c3", "wallet_ready"],
        ["c1", "merchant_selected"],
        ["c2", "merchant_selected"],
      ]),
    );
    expect(out[0]).toEqual({ step: "wallet_ready", count: 3, dropOff: null });
    expect(out[1].count).toBe(2);
    expect(out[1].dropOff).toBeCloseTo(1 - 2 / 3);
  });

  it("ignores rows with non-funnel event names", () => {
    const out = computeJourneyFunnel(
      rows([
        ["c1", "wallet_ready"],
        ["c1", "wallet_opened"], // learning-loop, not a funnel step
        ["c1", "totally_made_up"],
      ]),
    );
    expect(out[0].count).toBe(1);
  });

  it("requires no temporal ordering between steps", () => {
    // c1 reaches proof_opened before merchant_selected in row order — still counts both.
    const out = computeJourneyFunnel(
      rows([
        ["c1", "proof_opened"],
        ["c1", "merchant_selected"],
      ]),
    );
    expect(out[1].count).toBe(1); // merchant_selected
    expect(out[3].count).toBe(1); // proof_opened
  });

  it("sets dropOff to null on the first step", () => {
    const out = computeJourneyFunnel(rows([["c1", "wallet_ready"]]));
    expect(out[0].dropOff).toBeNull();
  });

  it("sets dropOff to null when the previous step's count is zero, even downstream", () => {
    const out = computeJourneyFunnel(
      rows([
        ["c1", "merchant_selected"],
        ["c1", "recommendation_viewed"],
      ]),
    );
    // wallet_ready has 0 clients; merchant_selected's dropOff must be null (zero denominator).
    expect(out[0].count).toBe(0);
    expect(out[0].dropOff).toBeNull();
    expect(out[1].count).toBe(1);
    expect(out[1].dropOff).toBeNull();
  });

  it("computes drop-off as max(0, 1 - count/prevCount), clamped at zero for growth", () => {
    const out = computeJourneyFunnel(
      rows([
        ["c1", "wallet_ready"],
        ["c2", "merchant_selected"],
        ["c3", "merchant_selected"],
      ]),
    );
    // prev=1, cur=2 -> 1 - 2/1 = -1 -> clamped to 0
    expect(out[0].count).toBe(1);
    expect(out[1].count).toBe(2);
    expect(out[1].dropOff).toBe(0);
  });

  it("handles a zero-count middle step without breaking the downstream chain", () => {
    const out = computeJourneyFunnel(
      rows([
        ["c1", "wallet_ready"],
        ["c1", "payment_choice_recorded"],
      ]),
    );
    expect(out.map((s) => s.count)).toEqual([1, 0, 0, 0, 1]);
    expect(out[1].dropOff).toBe(1); // 1 -> 0 is a full drop-off
    expect(out[2].dropOff).toBeNull(); // 0 -> 0 is a zero-denominator case
    expect(out[3].dropOff).toBeNull(); // 0 -> 0 is a zero-denominator case
    expect(out[4].dropOff).toBeNull(); // prev (proof_opened) count is 0
  });

  it("ignores extra fields on each row", () => {
    const out = computeJourneyFunnel([
      {
        client_id: "c1",
        name: "wallet_ready",
        props: { merchant: "x" },
        at: "2026-01-01",
      } as JourneyFunnelRow,
    ]);
    expect(out[0].count).toBe(1);
  });
});
