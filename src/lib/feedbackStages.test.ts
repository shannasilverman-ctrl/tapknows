import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FEEDBACK_STAGES,
  FEEDBACK_STAGE_SINK_KEY,
  feedbackStageLabel,
  isFeedbackStageId,
  readRecordedFeedbackStage,
  recordFeedbackStage,
} from "./feedback";

describe("FEEDBACK_STAGES", () => {
  it("covers exactly the four journey stages the report names", () => {
    expect(FEEDBACK_STAGES.map((s) => s.id)).toEqual([
      "finding_merchant",
      "setting_up_cards",
      "trusting_the_pick",
      "understanding_the_math",
    ]);
  });

  it("gives every stage a customer-facing label", () => {
    for (const stage of FEEDBACK_STAGES) {
      expect(stage.label.trim().length).toBeGreaterThan(0);
    }
    expect(FEEDBACK_STAGES.map((s) => s.label)).toEqual([
      "Finding the store",
      "Adding cards",
      "Trusting the pick",
      "Understanding the math",
    ]);
  });

  it("uses unique ids and unique labels", () => {
    expect(new Set(FEEDBACK_STAGES.map((s) => s.id)).size).toBe(4);
    expect(new Set(FEEDBACK_STAGES.map((s) => s.label)).size).toBe(4);
  });

  it("recognises its own ids and rejects anything else", () => {
    for (const stage of FEEDBACK_STAGES) {
      expect(isFeedbackStageId(stage.id)).toBe(true);
    }
    expect(isFeedbackStageId("trusting")).toBe(false);
    expect(isFeedbackStageId("")).toBe(false);
  });

  it("maps every id back to its label", () => {
    expect(feedbackStageLabel("finding_merchant")).toBe("Finding the store");
    expect(feedbackStageLabel("understanding_the_math")).toBe("Understanding the math");
  });
});

describe("recorded stage", () => {
  beforeEach(() => {
    (globalThis as unknown as { window?: unknown }).window = {};
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("records each stage in turn and reads back the one selected", () => {
    for (const stage of FEEDBACK_STAGES) {
      recordFeedbackStage(stage.id);
      expect(readRecordedFeedbackStage()).toBe(stage.id);
    }
  });

  it("clears back to null when the selection is dropped", () => {
    recordFeedbackStage("trusting_the_pick");
    expect(readRecordedFeedbackStage()).toBe("trusting_the_pick");
    recordFeedbackStage(null);
    expect(readRecordedFeedbackStage()).toBeNull();
  });

  it("exposes the sink under the key the e2e suite reads", () => {
    recordFeedbackStage("setting_up_cards");
    const w = globalThis as unknown as Record<string, Record<string, unknown>>;
    expect(w.window[FEEDBACK_STAGE_SINK_KEY]).toBe("setting_up_cards");
  });

  it("is inert without a window (SSR) instead of throwing", () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    expect(() => recordFeedbackStage("finding_merchant")).not.toThrow();
    expect(readRecordedFeedbackStage()).toBeNull();
  });
});
