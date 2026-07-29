import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addGuestCard, clearGuestWallet, getGuestWallet, type GuestWallet } from "./guestWallet";

const STORAGE_KEY = "card_savvy_guest_wallet_v1";

function installStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { window?: unknown }).window = { localStorage };
  return store;
}

let store: Map<string, string>;

beforeEach(() => {
  store = installStorage();
  clearGuestWallet();
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("guestWallet integrity", () => {
  it("returns a genuinely fresh empty wallet after clearing", () => {
    addGuestCard("amex_gold");
    expect(getGuestWallet().cards).toHaveLength(1);

    clearGuestWallet();
    expect(getGuestWallet().cards).toEqual([]);

    addGuestCard("chase_csp");
    expect(getGuestWallet().cards.map((card) => card.card_catalog_id)).toEqual(["chase_csp"]);
  });

  it("does not add the same card product twice", () => {
    const first = addGuestCard("amex_gold");
    const second = addGuestCard("amex_gold");

    expect(second.id).toBe(first.id);
    expect(getGuestWallet().cards).toHaveLength(1);
  });

  it("repairs duplicate stored products and keeps their related data on one card", () => {
    const corrupted: GuestWallet = {
      cards: [
        { id: "gold_first", card_catalog_id: "amex_gold" },
        { id: "gold_duplicate", card_catalog_id: "amex_gold" },
        { id: "sapphire", card_catalog_id: "chase_csp" },
      ],
      offers: [
        {
          id: "offer_duplicate",
          user_card_id: "gold_duplicate",
          merchant_text: "Whole Foods",
          offer_type: "percent_back",
          reward_type: "percent_back",
          reward_value: 5,
          min_spend: 50,
        },
      ],
      overrides: [],
      accounts: [
        {
          user_card_id: "gold_duplicate",
          credit_limit_cents: 10_000_00,
          current_balance_cents: 1_000_00,
        },
      ],
      prefs: {
        utilization_enabled: false,
        utilization_threshold_pct: 10,
        utilization_behavior: "warn",
      },
    };
    store.set(STORAGE_KEY, JSON.stringify(corrupted));

    const repaired = getGuestWallet();
    expect(repaired.cards.map((card) => card.card_catalog_id)).toEqual(["amex_gold", "chase_csp"]);
    expect(repaired.offers[0]?.user_card_id).toBe("gold_first");
    expect(repaired.accounts[0]?.user_card_id).toBe("gold_first");
  });
});
