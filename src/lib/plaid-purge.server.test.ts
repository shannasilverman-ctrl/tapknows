import { describe, expect, it } from "vitest";
import { shouldClearPlaidMemory } from "./plaid-purge.server";

describe("Plaid purge privacy default", () => {
  it("clears transaction-derived merchant memory on a normal disconnect", () => {
    expect(shouldClearPlaidMemory()).toBe(true);
    expect(shouldClearPlaidMemory(true)).toBe(true);
  });

  it("requires an explicit server-side opt-out to retain memory", () => {
    expect(shouldClearPlaidMemory(false)).toBe(false);
  });
});
