import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/sheet";
import { type CatalogCard } from "@/lib/cardCatalog";
import { downscaleImage, matchNames, type MatchResult } from "@/lib/screenshotImport";
import { extractCardNames } from "@/lib/screenshotImport.functions";
import { Camera, Plus, ArrowLeft } from "lucide-react";

// Reusable "photo → card names → confirm" flow.
// Used from both onboarding (step 1) and the wallet's Add-card sheet.
// The parent supplies the very first File (from a user-gesture click on its
// own <input>) so iOS lets the sheet open. All subsequent "Add another photo"
// picks happen from within the sheet's own input.

type ConfirmRow = {
  key: string; // stable de-dupe key
  input: string;
  candidates: CatalogCard[];
  pickedId: string;
  selected: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** The image that opened this sheet. Consumed once per open. */
  initialFile: File | null;
  /** Cards the user already owns — filtered from candidates and de-duped across photos. */
  existingCatalogIds?: Set<string>;
  /** Commit selected cards. Return the count actually saved. */
  onAddCards: (cards: CatalogCard[]) => Promise<number>;
  /** Deep-link to manual search for an unmatched name (e.g. onboarding search box). */
  onUnmatchedSearch?: (name: string) => void;
  /** Analytics context — distinguishes onboarding vs wallet imports in the funnel. */
  context: "onboarding" | "wallet";
};

export function PhotoImportSheet({
  open,
  onClose,
  initialFile,
  existingCatalogIds,
  onAddCards,
  onUnmatchedSearch,
  context,
}: Props) {
  const [reading, setReading] = useState(false);
  const [rows, setRows] = useState<ConfirmRow[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const consumedRef = useRef<File | null>(null);

  // Reset when the sheet closes (after animation).
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      setReading(false);
      setRows([]);
      setUnmatched([]);
      setErr(null);
      setAdding(false);
      setDone(null);
      consumedRef.current = null;
    }, 260);
    return () => window.clearTimeout(t);
  }, [open]);

  // When a new initialFile arrives with the sheet open, process it.
  useEffect(() => {
    if (!open || !initialFile) return;
    if (consumedRef.current === initialFile) return;
    consumedRef.current = initialFile;
    void handleFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile]);

  const ownedPlusPicked = useMemo(() => {
    const s = new Set<string>(existingCatalogIds ?? []);
    for (const r of rows) if (r.selected) s.add(r.pickedId);
    return s;
  }, [existingCatalogIds, rows]);

  async function handleFile(file: File) {
    setErr(null);
    // Guard against non-image files chosen from a file browser.
    const looksLikeImage =
      file.type.startsWith("image/") || /\.(heic|heif|png|jpe?g|webp|gif|bmp)$/i.test(file.name);
    if (!looksLikeImage) {
      setErr("That file isn't a supported image. Try a PNG, JPEG, or HEIC screenshot.");
      return;
    }
    setReading(true);
    try {
      const dataUrl = await downscaleImage(file, 1600, 0.82);
      console.info("[analytics] add_card_source", {
        source: "screenshot_import",
        context,
        stage: "extract_start",
      });
      const res = await extractCardNames({ data: { imageDataUrl: dataUrl } });
      if (res.error) {
        setErr(
          res.error === "no_credits"
            ? "AI reading is temporarily unavailable."
            : "We couldn't read the image. Try another photo or search manually.",
        );
        setReading(false);
        // If nothing has landed yet, drop cleanly out of the sheet so the
        // user isn't stuck on an empty screen.
        if (rows.length === 0 && unmatched.length === 0) {
          window.setTimeout(() => onClose(), 900);
        }
        return;
      }

      const report = matchNames(res.names);
      const owned = ownedPlusPicked;
      // De-dupe: skip any matched row whose picked candidate is already owned
      // OR already appears in the current confirm list.
      const existingInputs = new Set(rows.map((r) => r.input.toLowerCase()));
      const filteredMatched = report.matched
        .map((m: MatchResult) => ({
          input: m.input,
          candidates: m.candidates.filter((c) => !owned.has(c.id)),
        }))
        .filter((m) => m.candidates.length > 0 && !existingInputs.has(m.input.toLowerCase()));

      const existingUnmatched = new Set(unmatched.map((u) => u.toLowerCase()));
      const filteredUnmatched = report.unmatched.filter(
        (u) => !existingUnmatched.has(u.toLowerCase()),
      );

      if (
        filteredMatched.length === 0 &&
        filteredUnmatched.length === 0 &&
        rows.length === 0 &&
        unmatched.length === 0
      ) {
        setErr("No new card names found. Try another photo or search manually.");
        setReading(false);
        window.setTimeout(() => onClose(), 1200);
        return;
      }

      setRows((prev) => [
        ...prev,
        ...filteredMatched.map((m) => ({
          key: `${m.input}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          input: m.input,
          candidates: m.candidates,
          pickedId: m.candidates[0].id,
          selected: true,
        })),
      ]);
      setUnmatched((prev) => [...prev, ...filteredUnmatched]);
      console.info("[analytics] add_card_source", {
        source: "screenshot_import",
        context,
        stage: "matched",
        matched: filteredMatched.length,
        unmatched: filteredUnmatched.length,
      });
    } catch {
      setErr("We couldn't read that image. Try a PNG, JPEG, or HEIC screenshot.");
    } finally {
      setReading(false);
    }
  }

  async function handleAdd() {
    const picks: CatalogCard[] = [];
    for (const r of rows) {
      if (!r.selected) continue;
      const c = r.candidates.find((x) => x.id === r.pickedId);
      if (c) picks.push(c);
    }
    if (picks.length === 0) return;
    setAdding(true);
    try {
      const n = await onAddCards(picks);
      setDone(n);
      console.info("[analytics] add_card_source", {
        source: "screenshot_import",
        context,
        stage: "confirmed",
        count: n,
      });
      window.setTimeout(() => onClose(), 900);
    } catch {
      setAdding(false);
      setErr("Couldn't save those cards. Try again.");
    }
  }

  const selectedCount = rows.filter((r) => r.selected).length;

  const title =
    done !== null ? undefined : reading && rows.length === 0 ? "Reading photo" : "Cards we found";

  return (
    <Sheet open={open} onClose={onClose} title={title} busy={reading || adding}>
      {done !== null ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <span
            className="inline-flex items-center justify-center rounded-full"
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
            {done === 1 ? "Added to your wallet" : `Added ${done} cards`}
          </p>
        </div>
      ) : reading && rows.length === 0 && unmatched.length === 0 ? (
        <div className="py-10 text-center">
          <div
            className="mx-auto mb-4 size-10 rounded-full border-2 border-primary/30 border-t-primary motion-safe:animate-spin"
            aria-hidden
          />
          <p className="text-[15px] text-foreground">Reading your photo…</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            The image is used once and never stored.
          </p>
        </div>
      ) : (
        <div>
          {err && (
            <p className="mb-3 rounded-xl border border-border bg-secondary/50 px-3 py-2 text-[12px] text-muted-foreground">
              {err}
            </p>
          )}

          {rows.length > 0 && (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-white overflow-hidden">
              {rows.map((r, i) => {
                const card = r.candidates.find((c) => c.id === r.pickedId) ?? r.candidates[0];
                const ambiguous = r.candidates.length > 1;
                return (
                  <li key={r.key} className="px-3 py-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...r, selected: e.target.checked };
                          setRows(next);
                        }}
                        className="mt-1 size-5 accent-primary shrink-0"
                        aria-label={`Add ${card.issuer} ${card.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          {card.issuer}
                        </p>
                        <p className="text-[15px] font-medium text-foreground truncate">
                          {card.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          from “{r.input}”
                        </p>
                        {ambiguous && (
                          <div className="mt-2 -mx-1 flex flex-wrap gap-1">
                            {r.candidates.map((cand) => {
                              const active = cand.id === r.pickedId;
                              return (
                                <button
                                  key={cand.id}
                                  type="button"
                                  onClick={() => {
                                    const next = [...rows];
                                    next[i] = {
                                      ...r,
                                      pickedId: cand.id,
                                      selected: true,
                                    };
                                    setRows(next);
                                  }}
                                  className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors ${
                                    active
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border bg-white text-muted-foreground hover:border-primary/40"
                                  }`}
                                >
                                  {cand.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {unmatched.length > 0 && (
            <div className="mt-5">
              <p className="cs-microlabel text-[10px] mb-2">Couldn't match</p>
              <ul className="divide-y divide-border rounded-2xl border border-border bg-white overflow-hidden">
                {unmatched.map((u) => (
                  <li key={u}>
                    <button
                      type="button"
                      onClick={() => {
                        if (onUnmatchedSearch) {
                          onUnmatchedSearch(u);
                          onClose();
                        }
                      }}
                      disabled={!onUnmatchedSearch}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left min-h-11 disabled:opacity-70"
                    >
                      <span className="min-w-0 truncate text-[14px] text-foreground">{u}</span>
                      {onUnmatchedSearch && (
                        <span className="text-[12px] text-primary shrink-0">Search →</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add another photo — inline, visible after first result lands. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={reading || adding}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl border border-dashed border-border bg-white text-[14px] font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
          >
            {reading ? (
              <>
                <span
                  className="size-4 rounded-full border-2 border-primary/30 border-t-primary motion-safe:animate-spin"
                  aria-hidden
                />
                Reading…
              </>
            ) : (
              <>
                <Plus className="size-4" strokeWidth={2} />
                Add another photo
              </>
            )}
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleFile(f);
            }}
            aria-label="Choose another photo or screenshot"
          />

          <div className="mt-5 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 cs-btn-secondary h-12">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || selectedCount === 0}
              className="flex-1 cs-btn-primary h-12 disabled:opacity-60"
            >
              {adding
                ? "Adding…"
                : selectedCount === 0
                  ? "Nothing selected"
                  : `Add ${selectedCount} card${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>

          <p className="mt-3 text-center text-[11px] text-muted-foreground leading-snug">
            <Camera className="inline size-3 -mt-0.5 mr-1 opacity-60" aria-hidden />
            Photos are read once to find card names and never stored.
          </p>

          <p className="sr-only" aria-hidden>
            <ArrowLeft />
          </p>
        </div>
      )}
    </Sheet>
  );
}
