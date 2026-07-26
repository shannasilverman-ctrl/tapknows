import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The unit suite runs in the node environment, so stand up the minimal
// localStorage surface the module reads through.
function installStorage(): { store: Map<string, string> } {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { window?: unknown }).window = { localStorage };
  return { store };
}

let store: Map<string, string>;

beforeEach(async () => {
  ({ store } = installStorage());
  const m = await import("./feeMemory");
  m.clearFeeMemory();
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("feeMemory", () => {
  it("remembers a fee entered for a merchant", async () => {
    const { rememberMerchantFee, recallMerchantFee } = await import("./feeMemory");
    rememberMerchantFee("whole_foods", 3);
    expect(recallMerchantFee("whole_foods")?.feePct).toBe(3);
  });

  it("returns it on a later lookup for that merchant", async () => {
    const { rememberMerchantFee, recallMerchantFeePct } = await import("./feeMemory");
    rememberMerchantFee("local_bodega", 2.5);
    // several unrelated lookups in between
    expect(recallMerchantFeePct("whole_foods")).toBe(0);
    expect(recallMerchantFeePct("local_amazon")).toBe(0);
    expect(recallMerchantFeePct("local_bodega")).toBe(2.5);
  });

  it("survives a simulated reload", async () => {
    const first = await import("./feeMemory");
    first.rememberMerchantFee("corner_market", 4);

    // A reload keeps localStorage but throws away every module instance.
    // Re-point `window` at the same backing store and re-read from scratch.
    (globalThis as unknown as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
          return store.size;
        },
      },
    };

    const afterReload = await import("./feeMemory");
    expect(afterReload.recallMerchantFee("corner_market")?.feePct).toBe(4);
  });

  it("returns nothing for a merchant never fee-tagged", async () => {
    const { rememberMerchantFee, recallMerchantFee, recallMerchantFeePct } =
      await import("./feeMemory");
    rememberMerchantFee("whole_foods", 3);
    expect(recallMerchantFee("never_tagged")).toBeNull();
    expect(recallMerchantFeePct("never_tagged")).toBe(0);
  });

  it("treats a zero or negative fee as a correction, not a stored value", async () => {
    const { rememberMerchantFee, recallMerchantFee } = await import("./feeMemory");
    rememberMerchantFee("whole_foods", 3);
    expect(recallMerchantFee("whole_foods")?.feePct).toBe(3);
    rememberMerchantFee("whole_foods", 0);
    expect(recallMerchantFee("whole_foods")).toBeNull();
  });

  it("forgets one merchant without disturbing the others", async () => {
    const { rememberMerchantFee, forgetMerchantFee, recallMerchantFeePct } =
      await import("./feeMemory");
    rememberMerchantFee("a_shop", 3);
    rememberMerchantFee("b_shop", 5);
    forgetMerchantFee("a_shop");
    expect(recallMerchantFeePct("a_shop")).toBe(0);
    expect(recallMerchantFeePct("b_shop")).toBe(5);
  });

  it("is inert without a window (SSR) instead of throwing", async () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    const { rememberMerchantFee, recallMerchantFee } = await import("./feeMemory");
    expect(() => rememberMerchantFee("whole_foods", 3)).not.toThrow();
    expect(recallMerchantFee("whole_foods")).toBeNull();
  });
});
