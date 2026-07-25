import { Bookmark, X } from "lucide-react";

type Props = {
  onSave: () => void;
  onDismiss: () => void;
};

/**
 * Pass-styled conversion moment on Home. Guest only, shown after the
 * first decide + push sheet. Dismissible; collapses to a header pill.
 */
export function SaveWalletCard({ onSave, onDismiss }: Props) {
  return (
    <div className="cs-pass relative cs-fade-up">
      <button
        onClick={onDismiss}
        aria-label="Not now"
        className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Bookmark className="size-4" />
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Save</span>
      </div>
      <div className="cs-pass-divider" aria-hidden />
      <p className="text-[16px] font-semibold text-foreground leading-snug">Keep this wallet.</p>
      <p className="mt-1 text-[13px] text-muted-foreground leading-snug">
        Save your cards, priorities, and recovered balance.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={onSave} className="cs-btn-primary h-11 px-5 text-[14px]">
          Save my wallet
        </button>
        <button
          onClick={onDismiss}
          className="text-[13px] text-muted-foreground hover:text-foreground px-3 h-11"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
