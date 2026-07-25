import { useMemo, useState } from "react";
import { Sheet } from "@/components/sheet";
import { CardFace } from "@/components/card-face";
import { CARD_CATALOG, CATALOG_BY_ID } from "@/lib/cardCatalog";
import { Check, ChevronDown } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { confirmPlaidMatches, type PlaidCandidate } from "@/lib/plaid.functions";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  itemId: string;
  candidates: PlaidCandidate[];
};

type Row = {
  account_id: string;
  mask: string | null;
  label: string;
  catalog_id: string | null;
  checked: boolean;
};

/**
 * Confirmation sheet: matched candidates pre-checked with card face;
 * unmatched ones show a catalog picker so the user always confirms.
 */
export function PlaidMatchSheet({ open, onClose, itemId, candidates }: Props) {
  const confirm = useServerFn(confirmPlaidMatches);
  const [rows, setRows] = useState<Row[]>(() =>
    candidates.map((c) => ({
      account_id: c.account_id,
      mask: c.mask,
      label: c.account_name,
      catalog_id: c.suggested_catalog_id,
      checked: !!c.suggested_catalog_id,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const catalogOptions = useMemo(
    () =>
      CARD_CATALOG.slice().sort((a, b) =>
        `${a.issuer} ${a.name}`.localeCompare(`${b.issuer} ${b.name}`),
      ),
    [],
  );

  const update = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const canConfirm = rows.some((r) => r.checked && r.catalog_id);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const matches = rows
        .filter((r) => r.checked && r.catalog_id)
        .map((r) => ({
          account_id: r.account_id,
          catalog_id: r.catalog_id!,
          mask: r.mask,
        }));
      const res = await confirm({ data: { item_id: itemId, matches } });
      setDone(true);
      window.setTimeout(() => {
        toast.success(`Added ${res.added} ${res.added === 1 ? "card" : "cards"}`);
        onClose();
      }, 700);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't add those cards.");
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={done ? undefined : "Confirm your cards"}
      busy={busy}
    >
      {done ? (
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
                stroke="#fff"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="mt-5 cs-title-md text-foreground">Cards added</p>
        </div>
      ) : (
        <div>
          <p className="text-[13px] text-muted-foreground -mt-1 mb-4">
            We matched what we could. Confirm or pick the right card.
          </p>
          <ul className="space-y-3 max-h-[54vh] overflow-y-auto pr-1">
            {rows.map((r, idx) => {
              const cat = r.catalog_id ? CATALOG_BY_ID[r.catalog_id] : null;
              return (
                <li key={r.account_id} className="rounded-2xl border border-border bg-white p-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => update(idx, { checked: !r.checked })}
                      className={`mt-1 inline-flex size-6 items-center justify-center rounded-full border shrink-0 transition-colors ${
                        r.checked
                          ? "bg-foreground border-foreground text-background"
                          : "border-border-strong text-transparent"
                      }`}
                      aria-label={r.checked ? "Unselect card" : "Select card"}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {r.label}
                        {r.mask ? ` · •${r.mask}` : ""}
                      </p>
                      {cat ? (
                        <div className="mt-2">
                          <div className="mx-auto max-w-[220px]">
                            <CardFace issuer={cat.issuer} name={cat.name} />
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          Pick the matching card below.
                        </p>
                      )}
                      <label className="mt-3 relative block">
                        <select
                          value={r.catalog_id ?? ""}
                          onChange={(e) =>
                            update(idx, {
                              catalog_id: e.target.value || null,
                              checked: !!e.target.value,
                            })
                          }
                          className="w-full h-11 appearance-none rounded-xl border border-border bg-white pl-3 pr-9 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                        >
                          <option value="">Pick a card…</option>
                          {catalogOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.issuer} — {c.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      </label>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl border border-border bg-white text-[15px] font-medium text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || !canConfirm}
              className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground text-[15px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {busy ? "Adding…" : "Add to wallet"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
