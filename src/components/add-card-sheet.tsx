import { useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/sheet";
import { CARD_CATALOG, type CatalogCard } from "@/lib/cardCatalog";
import { CardFace } from "@/components/card-face";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { PhotoImportSheet } from "@/components/photo-import-sheet";
import { Search, Check, ArrowLeft, Plus, Camera } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (card: CatalogCard, source?: "manual" | "screenshot_import") => Promise<void> | void;
  existingCatalogIds?: Set<string>;
  onPlaidNeedAuth?: () => void;
  onPlaidComplete?: () => void;
};

type Step = "choose" | "manual" | "selected" | "done";

export function AddCardSheet({
  open,
  onClose,
  onConfirm,
  existingCatalogIds,
  onPlaidNeedAuth,
  onPlaidComplete,
}: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogCard | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [photoImportFile, setPhotoImportFile] = useState<File | null>(null);
  const [photoImportOpen, setPhotoImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = CARD_CATALOG.filter((c) => !existingCatalogIds || !existingCatalogIds.has(c.id));
    if (!q) return pool.slice(0, 20);
    return pool
      .filter((c) => {
        const hay = `${c.issuer} ${c.name}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [query, existingCatalogIds]);

  const reset = () => {
    setStep("choose");
    setQuery("");
    setSelected(null);
    setConfirming(false);
    setAddedCount(0);
  };

  const handleClose = () => {
    onClose();
    window.setTimeout(reset, 260);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      await onConfirm(selected, "manual");
      setStep("done");
      window.setTimeout(() => {
        handleClose();
      }, 780);
    } catch {
      setConfirming(false);
    }
  };

  // Screenshot / photo import handled by PhotoImportSheet — shared with onboarding.
  const handlePhotoAdd = async (cards: CatalogCard[]): Promise<number> => {
    let ok = 0;
    for (const c of cards) {
      try {
        await onConfirm(c, "screenshot_import");
        ok += 1;
      } catch {
        /* per-card failures reflected in lower count */
      }
    }
    setAddedCount(ok);
    // Also close the outer AddCardSheet after the inner one confirms.
    window.setTimeout(() => handleClose(), 950);
    return ok;
  };

  const title =
    step === "done"
      ? undefined
      : step === "manual"
        ? "Add cards manually"
        : step === "selected"
          ? "Confirm card"
          : "Add a card";

  return (
    <>
      <Sheet open={open && !photoImportOpen} onClose={handleClose} title={title} busy={confirming}>
        {step === "done" ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span
              className="cs-check-badge inline-flex items-center justify-center rounded-full"
              style={{
                width: 72,
                height: 72,
                background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
                boxShadow: "0 12px 28px -10px rgba(59,130,246,0.55)",
              }}
              aria-hidden
            >
              <svg viewBox="0 0 32 32" width="34" height="34" fill="none">
                <path
                  d="M8 17 L14 23 L24 11"
                  stroke="#ffffff"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className="mt-5 cs-title-md text-foreground">
              {addedCount > 1 ? `Added ${addedCount} cards` : "Added to your wallet"}
            </p>
            {addedCount === 0 && selected && (
              <p className="mt-1 text-[13px] text-muted-foreground">
                {selected.issuer} · {selected.name}
              </p>
            )}
          </div>
        ) : step === "selected" && selected ? (
          <div>
            <div className="mx-auto max-w-[300px]">
              <CardFace issuer={selected.issuer} name={selected.name} variant="winner" />
            </div>
            <div className="mt-5 rounded-2xl bg-secondary/60 px-4 py-3">
              <p className="text-[12px] text-muted-foreground">Confirm add</p>
              <p className="text-[15px] font-medium text-foreground mt-0.5">
                {selected.issuer} · {selected.name}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setStep("manual");
                }}
                className="flex-1 cs-btn-secondary h-12"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 cs-btn-primary h-12 disabled:opacity-70"
              >
                {confirming ? "Adding…" : "Add card"}
              </button>
            </div>
          </div>
        ) : step === "manual" ? (
          <div>
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors min-h-11 -ml-1 pl-1 pr-2"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search issuer or card name"
                className="w-full h-12 rounded-2xl border border-border bg-white pl-11 pr-4 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <ul className="mt-3 max-h-[52vh] overflow-y-auto divide-y divide-border rounded-2xl border border-border bg-white">
              {results.length === 0 ? (
                <li className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  No matches. Try a different name.
                </li>
              ) : (
                results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(c);
                        setStep("selected");
                      }}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left min-h-11"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          {c.issuer}
                        </p>
                        <p className="text-[15px] font-medium text-foreground truncate">{c.name}</p>
                      </div>
                      <Check className="size-4 text-primary opacity-0" aria-hidden />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : (
          // step === "choose"
          <div className="space-y-3">
            <div>
              <PlaidLinkButton
                label="Set up with Plaid"
                onComplete={() => {
                  onPlaidComplete?.();
                  onClose();
                }}
                onNeedAuth={() => {
                  onPlaidNeedAuth?.();
                  onClose();
                }}
              />
            </div>

            {/* Photo quick load — second in the hierarchy. */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl border border-border bg-white text-[14px] font-medium text-foreground hover:border-primary/40 transition-colors"
            >
              <Camera className="size-4" strokeWidth={2} />
              Add cards from a photo
            </button>
            <p className="text-center text-[12px] text-muted-foreground leading-snug">
              Snap your cards or upload a screenshot of your wallet. Photos are read once and never
              stored.
            </p>

            <button
              type="button"
              onClick={() => setStep("manual")}
              className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl border border-border bg-white text-[14px] font-medium text-foreground hover:border-primary/40 transition-colors"
            >
              <Plus className="size-4" strokeWidth={2} />
              Add cards manually
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) {
                  setPhotoImportFile(f);
                  setPhotoImportOpen(true);
                }
              }}
              aria-label="Choose a photo or screenshot of your cards"
            />
          </div>
        )}
      </Sheet>

      <PhotoImportSheet
        open={photoImportOpen}
        onClose={() => setPhotoImportOpen(false)}
        initialFile={photoImportFile}
        existingCatalogIds={existingCatalogIds}
        onAddCards={handlePhotoAdd}
        onUnmatchedSearch={(name) => {
          setQuery(name);
          setStep("manual");
        }}
        context="wallet"
      />
    </>
  );
}
