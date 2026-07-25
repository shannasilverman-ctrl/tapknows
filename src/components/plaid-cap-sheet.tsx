import { Sheet } from "@/components/sheet";
import { Plus } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Opens the manual add-card flow so the user still has a path forward. */
  onAddManually: () => void;
};

/**
 * Shown when the account-wide Plaid Item cap is hit. Deliberately calm — no
 * mention of Plaid or error codes, just what the user can still do.
 */
export function PlaidCapSheet({ open, onClose, onAddManually }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="At capacity">
      <div>
        <p className="text-[15px] leading-snug text-foreground">
          TAP is at capacity for bank links right now. Your wallet still works, add cards manually.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full inline-flex items-center justify-center h-12 rounded-2xl border border-border bg-white text-[14px] font-medium text-foreground hover:border-primary/40 transition-colors"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onAddManually();
            }}
            className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground text-[15px] font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="size-4" strokeWidth={2} />
            Add cards manually
          </button>
        </div>
      </div>
    </Sheet>
  );
}
