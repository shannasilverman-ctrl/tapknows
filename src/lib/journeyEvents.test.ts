import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DECISION_FUNNEL_EVENTS,
  JOURNEY_EVENTS,
  LEARNING_LOOP_EVENTS,
  hasJourneyEvent,
  isJourneyEvent,
  readJourneyEvents,
  resetJourneyEvents,
  trackJourneyEvent,
} from "./journeyEvents";

beforeEach(() => {
  resetJourneyEvents();
});

describe("journey event names", () => {
  it("locks the decision-funnel set the report ordered instrumented", () => {
    expect([...DECISION_FUNNEL_EVENTS]).toEqual([
      "wallet_ready",
      "merchant_selected",
      "recommendation_viewed",
      "proof_opened",
      "payment_choice_recorded",
    ]);
  });

  it("locks the learning-loop set the report ordered instrumented", () => {
    expect([...LEARNING_LOOP_EVENTS]).toEqual([
      "wallet_opened",
      "situation_tried",
      "card_guide_opened",
      "benefit_detail_opened",
    ]);
  });

  it("exposes both loops as one canonical list with no duplicates", () => {
    expect(JOURNEY_EVENTS).toHaveLength(9);
    expect(new Set(JOURNEY_EVENTS).size).toBe(9);
  });

  it("recognises canonical names and rejects everything else", () => {
    expect(isJourneyEvent("recommendation_viewed")).toBe(true);
    expect(isJourneyEvent("card_guide_opened")).toBe(true);
    expect(isJourneyEvent("recommendation_view")).toBe(false);
    expect(isJourneyEvent("")).toBe(false);
  });
});

describe("trackJourneyEvent", () => {
  it("records a canonical event to a sink a test can read back", () => {
    expect(trackJourneyEvent("merchant_selected", { merchantId: "whole_foods" })).toBe(true);
    const records = readJourneyEvents();
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("merchant_selected");
    expect(records[0].props).toEqual({ merchantId: "whole_foods" });
    expect(typeof records[0].at).toBe("string");
  });

  it("accepts only the canonical names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(trackJourneyEvent("not_a_real_event")).toBe(false);
    expect(readJourneyEvents()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps events in emission order", () => {
    trackJourneyEvent("wallet_ready");
    trackJourneyEvent("merchant_selected");
    trackJourneyEvent("recommendation_viewed");
    expect(readJourneyEvents().map((r) => r.name)).toEqual([
      "wallet_ready",
      "merchant_selected",
      "recommendation_viewed",
    ]);
  });

  it("answers whether a specific event was seen", () => {
    expect(hasJourneyEvent("proof_opened")).toBe(false);
    trackJourneyEvent("proof_opened");
    expect(hasJourneyEvent("proof_opened")).toBe(true);
  });

  it("clears the sink on reset so suites stay isolated", () => {
    trackJourneyEvent("wallet_opened");
    expect(readJourneyEvents()).toHaveLength(1);
    resetJourneyEvents();
    expect(readJourneyEvents()).toHaveLength(0);
  });

  it("records every canonical name without rejecting any of them", () => {
    for (const name of JOURNEY_EVENTS) {
      expect(trackJourneyEvent(name)).toBe(true);
    }
    expect(readJourneyEvents()).toHaveLength(JOURNEY_EVENTS.length);
  });
});
