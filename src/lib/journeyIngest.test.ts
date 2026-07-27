import { describe, expect, it } from "vitest";
import { JOURNEY_EVENTS } from "./journeyEvents";
import { journeyIngest, type JourneyIngestInput } from "./journeyIngest";

describe("journeyIngest", () => {
  it("admits every one of the nine canonical event names", () => {
    for (const name of JOURNEY_EVENTS) {
      const input: JourneyIngestInput = { client_id: "c1", name, at: "2026-07-26T00:00:00.000Z" };
      const r = journeyIngest(input);
      expect(r.ok).toBe(true);
    }
  });

  it("rejects an unknown event name and normalizes nothing", () => {
    const r = journeyIngest({
      client_id: "c1",
      name: "totally_made_up",
      at: "2026-07-26T00:00:00.000Z",
    });
    expect(r.ok).toBe(false);
  });

  it("allowlists props to merchant and category slugs only", () => {
    const r = journeyIngest({
      client_id: "c1",
      name: "merchant_selected",
      at: "2026-07-26T00:00:00.000Z",
      props: { merchant: "whole_foods", category: "groceries", extra: "nope" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.props).toEqual({ merchant: "whole_foods", category: "groceries" });
    }
  });

  it("strips amounts — never persists a dollar figure under any key", () => {
    const r = journeyIngest({
      client_id: "c1",
      name: "payment_choice_recorded",
      at: "2026-07-26T00:00:00.000Z",
      props: { amount: 42.5, merchant: "costco", amountCents: 4250, total: 10 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.props).toEqual({ merchant: "costco" });
      expect(JSON.stringify(r.row.props)).not.toMatch(/amount|total/i);
    }
  });

  it("omits props entirely when none were provided", () => {
    const r = journeyIngest({
      client_id: "c1",
      name: "wallet_opened",
      at: "2026-07-26T00:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.props).toEqual({});
    }
  });

  it("requires a non-empty client_id", () => {
    const r = journeyIngest({
      client_id: "",
      name: "wallet_opened",
      at: "2026-07-26T00:00:00.000Z",
    });
    expect(r.ok).toBe(false);
  });

  it("requires a valid ISO timestamp for at", () => {
    const r = journeyIngest({
      client_id: "c1",
      name: "wallet_opened",
      at: "not-a-date",
    });
    expect(r.ok).toBe(false);
  });
});
