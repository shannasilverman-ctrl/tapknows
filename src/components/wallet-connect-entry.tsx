import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { listPlaidItems } from "@/lib/plaid.functions";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { LinkedBanks } from "@/components/linked-banks";
import { PlaidCapSheet } from "@/components/plaid-cap-sheet";

type Props = {
  /** Guests still see the pair; tapping Plaid routes through onPlaidNeedAuth. */
  isGuest: boolean;
  /** Opens the manual add-card sheet / catalog search. */
  onManual: () => void;
  /** Called when a guest taps Plaid — should open the one-tap account gate. */
  onPlaidNeedAuth?: () => void;
  /** Called after a successful Plaid link/match; parent should refetch wallet. */
  onPlaidComplete?: () => void;
  /** Force the "no links" pair even for signed-in users (e.g. empty state). */
  forceCompactPair?: boolean;
  /** Render a single quiet Plaid button — no manual pair, no helper copy.
   *  Used as the single connect affordance in the main flow when nothing
   *  is linked yet. */
  singleQuiet?: boolean;
};

/**
 * The wallet-screen entry point for adding cards.
 *
 * Two states:
 * - No linked institutions (or guest): primary manual add + optional Plaid
 *   sync. Both are always visible.
 * - One or more linked institutions: shows the linked-institutions row
 *   (status per the connection-health rules) plus a smaller "Link another
 *   bank" secondary button.
 */
export function WalletConnectEntry({
  isGuest,
  onManual,
  onPlaidNeedAuth,
  onPlaidComplete,
  forceCompactPair,
  singleQuiet,
}: Props) {
  const listItems = useServerFn(listPlaidItems);
  const [hasItems, setHasItems] = useState<boolean | null>(isGuest ? false : null);
  const [capOpen, setCapOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (isGuest) {
      setHasItems(false);
      return;
    }
    try {
      const r = await listItems();
      setHasItems((r.items ?? []).length > 0);
    } catch {
      // Silent — the entry still needs to render its no-links pair.
      setHasItems(false);
    }
  }, [isGuest, listItems]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Loading (signed-in only) — keep the block quiet, no skeleton flash.
  if (hasItems === null) return null;

  if (hasItems && !forceCompactPair) {
    return (
      <>
        <div className="space-y-3">
          <LinkedBanks compact />
          <PlaidLinkButton
            variant="secondary"
            label="Link another bank"
            onComplete={() => {
              onPlaidComplete?.();
              refresh();
            }}
            onNeedAuth={onPlaidNeedAuth}
            onAtCapacity={() => setCapOpen(true)}
          />
        </div>
        <PlaidCapSheet open={capOpen} onClose={() => setCapOpen(false)} onAddManually={onManual} />
      </>
    );
  }

  if (singleQuiet) {
    return (
      <>
        <PlaidLinkButton
          variant="secondary"
          label="Optional: sync cards with Plaid"
          onComplete={() => {
            onPlaidComplete?.();
            refresh();
          }}
          onNeedAuth={onPlaidNeedAuth}
          onAtCapacity={() => setCapOpen(true)}
        />
        <PlaidCapSheet open={capOpen} onClose={() => setCapOpen(false)} onAddManually={onManual} />
      </>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <button
          type="button"
          onClick={onManual}
          className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground text-[14px] font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="size-4" strokeWidth={2} />
          Add cards manually
        </button>
        <div>
          <PlaidLinkButton
            variant="secondary"
            label="Sync cards with Plaid (optional)"
            onComplete={() => {
              onPlaidComplete?.();
              refresh();
            }}
            onNeedAuth={onPlaidNeedAuth}
            onAtCapacity={() => setCapOpen(true)}
          />
        </div>
        <p className="text-center text-[12px] text-muted-foreground leading-snug">
          Manual setup needs only card product names. Plaid sync requires sign-in.
        </p>
      </div>
      <PlaidCapSheet open={capOpen} onClose={() => setCapOpen(false)} onAddManually={onManual} />
    </>
  );
}
