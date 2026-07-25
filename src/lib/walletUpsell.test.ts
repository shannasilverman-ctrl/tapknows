import { describe, expect, it } from "vitest";
import { recommend, type EngineCard } from "./recommendationEngine";
import { computeWalletUpsell } from "./walletUpsell";

// Two owned cards, one cashback + one 2x groceries.
const ownedDoubleCash = (): EngineCard => ({
  id: "owned_dc",
  card_catalog_id: "citi_dc",
  issuer: "Citi",
  name: "Double Cash",
  points_program_id: "cashback",
  foreign_tx_fee_pct: 0,
  earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
});

// A better-for-groceries catalog card the user does NOT own.
const catalogAmexGold = (): EngineCard => ({
  id: "catalog_amex_gold",
  card_catalog_id: "amex_gold",
  issuer: "Amex",
  name: "Gold",
  points_program_id: "mr",
  foreign_tx_fee_pct: 0,
  earn_rules: [
    { category: "groceries", multiplier: 4 },
    { category: "everything_else", multiplier: 1 },
  ],
});

// A wallet card that IS the global best for hotels, so upsell should be null.
const ownedHyatt = (): EngineCard => ({
  id: "owned_hyatt",
  card_catalog_id: "chase_hyatt",
  issuer: "Chase",
  name: "World of Hyatt",
  points_program_id: "hyatt",
  foreign_tx_fee_pct: 0,
  earn_rules: [
    { category: "hotels", multiplier: 4 },
    { category: "everything_else", multiplier: 1 },
  ],
});

const valuations = { cashback: 1.0, mr: 2.0, hyatt: 1.7 };

describe("wallet-scoped recommendation vs. global catalog", () => {
  it("picks the best OWNED card, not the global best", () => {
    // $100 groceries with only Double Cash owned. Amex Gold would earn more,
    // but the wallet result must still recommend Double Cash.
    const walletResult = recommend({
      amountCents: 10000,
      category: "groceries",
      wallet: [ownedDoubleCash()],
      offers: [],
      valuations,
    });
    expect(walletResult.winner?.legs[0].cardLabel).toBe("Citi Double Cash");
    // 2% of $100 = 200¢.
    expect(walletResult.winner?.totalValueCents).toBe(200);
  });

  it("falls back to the full catalog when the wallet is empty", () => {
    const emptyWallet = recommend({
      amountCents: 10000,
      category: "groceries",
      wallet: [],
      offers: [],
      valuations,
    });
    expect(emptyWallet.winner).toBeNull();
    expect(emptyWallet.emptyWalletGuidance).toBe("empty_wallet");

    // Fallback: same input against the full catalog surfaces a real play.
    const fallback = recommend({
      amountCents: 10000,
      category: "groceries",
      wallet: [ownedDoubleCash(), catalogAmexGold()],
      offers: [],
      valuations,
    });
    expect(fallback.winner?.legs[0].cardLabel).toBe("Amex Gold");
    // 4 pts * $100 * 2.0¢ = 800¢.
    expect(fallback.winner?.totalValueCents).toBe(800);
  });
});

describe("computeWalletUpsell", () => {
  it("returns the delta and card name when a catalog card beats the wallet play", () => {
    const walletResult = recommend({
      amountCents: 10000,
      category: "groceries",
      wallet: [ownedDoubleCash()],
      offers: [],
      valuations,
    });
    const upsell = computeWalletUpsell(
      walletResult,
      {
        amountCents: 10000,
        category: "groceries",
        offers: [],
        valuations,
      },
      [catalogAmexGold()],
    );
    // Wallet earns 200¢, Amex Gold earns 800¢ → delta 600¢.
    expect(upsell).not.toBeNull();
    expect(upsell?.cardName).toBe("Amex Gold");
    expect(upsell?.cardCatalogId).toBe("amex_gold");
    expect(upsell?.deltaCents).toBe(600);
  });

  it("returns null when the wallet already holds the best card", () => {
    // Owned Hyatt (4x hotels @1.7¢). Amex Gold has no hotel bonus (1x).
    // On $200 hotels, Hyatt = 200 * 4 * 1.7 = 1360¢; Amex Gold = 200 * 1 * 2.0 = 400¢.
    const walletResult = recommend({
      amountCents: 20000,
      category: "hotels",
      wallet: [ownedHyatt()],
      offers: [],
      valuations,
    });
    const upsell = computeWalletUpsell(
      walletResult,
      {
        amountCents: 20000,
        category: "hotels",
        offers: [],
        valuations,
      },
      [catalogAmexGold()],
    );
    expect(upsell).toBeNull();
  });
});
