import { describe, it, expect, beforeEach } from "vitest";
import {
  setMerchantCategory,
  getMerchantCategory,
  clearMerchantCategory,
  rememberMerchantCategory,
  recallMerchantCategory,
} from "./merchantCategoryMemo";

// Minimal localStorage stub for the node test env.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  const g = globalThis as unknown as {
    window: { localStorage: MemStorage; dispatchEvent: () => void };
    Event: unknown;
  };
  g.window = {
    localStorage: new MemStorage(),
    dispatchEvent: () => {},
  };
  g.Event = class {
    constructor(public type: string) {}
  };
});

describe("merchantCategoryMemo — persistent corrections", () => {
  it("saved correction wins over default and survives roundtrips", () => {
    setMerchantCategory("u1", "Whole Foods", "dining");
    expect(getMerchantCategory("u1", "whole foods")).toBe("dining");
    expect(getMerchantCategory("u1", "WHOLE  FOODS")).toBe("dining");
  });

  it("clearing a correction restores the default (returns null)", () => {
    setMerchantCategory("u1", "Costco", "wholesale_clubs");
    clearMerchantCategory("u1", "costco");
    expect(getMerchantCategory("u1", "Costco")).toBeNull();
  });

  it("corrections are per-merchant, not global", () => {
    setMerchantCategory("u1", "Trader Joe's", "groceries");
    expect(getMerchantCategory("u1", "Trader Joe's")).toBe("groceries");
    expect(getMerchantCategory("u1", "Sam's Club")).toBeNull();
  });

  it("corrections are per-user (no cross-account leakage)", () => {
    setMerchantCategory("u1", "Delta", "travel");
    expect(getMerchantCategory("u2", "Delta")).toBeNull();
    expect(getMerchantCategory("u1", "Delta")).toBe("travel");
  });

  it("legacy rememberMerchantCategory maps to the guest bag", () => {
    rememberMerchantCategory("Uber", "travel");
    expect(recallMerchantCategory("uber")).toBe("travel");
    expect(getMerchantCategory(null, "Uber")).toBe("travel");
  });
});
