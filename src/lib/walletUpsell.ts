// Wallet-vs-catalog upsell: given the play the user's OWNED wallet earns,
// scan the full catalog (with owned cards excluded) for a single card that
// would have earned more on this exact purchase. Returns the biggest-delta
// upsell candidate, or null when the wallet already has the best card for
// this charge. All math flows through the same engine as the wallet play,
// so caps, offers, and foreign-tx penalties are respected identically.

import {
  recommend,
  type EngineCard,
  type EngineInput,
  type EngineOutput,
} from "./recommendationEngine";

export type WalletUpsell = {
  cardName: string;
  cardCatalogId: string;
  deltaCents: number;
};

/**
 * @param walletResult   Engine output computed against the user's wallet.
 * @param baseInput      Same engine input used for `walletResult`, minus `wallet`.
 * @param catalogCards   Catalog cards to consider (the caller should exclude
 *                       any cards the user already owns).
 */
export function computeWalletUpsell(
  walletResult: EngineOutput,
  baseInput: Omit<EngineInput, "wallet">,
  catalogCards: EngineCard[],
): WalletUpsell | null {
  if (!walletResult.winner) return null;
  const walletTotal = walletResult.winner.totalValueCents;

  let best: WalletUpsell | null = null;
  for (const card of catalogCards) {
    // Offers are owner-scoped; a catalog-only card cannot fire wallet offers,
    // so we drop them for this hypothetical single-card play.
    const out = recommend({
      ...baseInput,
      wallet: [card],
      offers: [],
    });
    if (!out.winner) continue;
    const delta = out.winner.totalValueCents - walletTotal;
    if (delta > 0 && (!best || delta > best.deltaCents)) {
      best = {
        cardName: `${card.issuer} ${card.name}`,
        cardCatalogId: card.card_catalog_id,
        deltaCents: delta,
      };
    }
  }
  return best;
}
