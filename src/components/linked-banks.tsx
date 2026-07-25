import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Landmark, Loader2, Sparkles, Trash2 } from "lucide-react";
import { listPlaidItems, unlinkPlaidItem } from "@/lib/plaid.functions";
import { PlaidLinkButton } from "@/components/plaid-link-button";
import { toast } from "sonner";

type Item = {
  plaid_item_id: string;
  institution_name: string | null;
  status: string | null;
  needs_attention_at: string | null;
  new_accounts_at: string | null;
  webhook_code_last: string | null;
};

type Mode = "reconnect" | "add_accounts";

type Props = {
  /** Deep-link auto-open: `?reconnect=<id>`. */
  autoReconnect?: string | null;
  /** Deep-link auto-open: `?add_accounts=<id>`. */
  autoAddAccounts?: string | null;
  compact?: boolean;
};

export function LinkedBanks({ autoReconnect, autoAddAccounts, compact }: Props) {
  const listItems = useServerFn(listPlaidItems);
  const unlink = useServerFn(unlinkPlaidItem);
  const [items, setItems] = useState<Item[] | null>(null);
  const [activeFlow, setActiveFlow] = useState<{ id: string; mode: Mode } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [alsoClearMemory, setAlsoClearMemory] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await listItems();
      setItems(r.items as Item[]);
    } catch (e) {
      console.error("[linked-banks]", e);
      setItems([]);
    }
  }, [listItems]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!items) return;
    if (autoReconnect && items.some((i) => i.plaid_item_id === autoReconnect)) {
      setActiveFlow({ id: autoReconnect, mode: "reconnect" });
    } else if (autoAddAccounts && items.some((i) => i.plaid_item_id === autoAddAccounts)) {
      setActiveFlow({ id: autoAddAccounts, mode: "add_accounts" });
    }
  }, [autoReconnect, autoAddAccounts, items]);

  if (items === null) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading linked banks…
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-2"}>
      {items.map((it) => {
        const needs = it.status === "needs_attention" || !!it.needs_attention_at;
        const hasNew = !!it.new_accounts_at;
        const name = it.institution_name?.trim() || "Linked bank";
        const flow = activeFlow?.id === it.plaid_item_id ? activeFlow.mode : null;
        return (
          <div
            key={it.plaid_item_id}
            className="rounded-2xl border border-border bg-white px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3 min-h-11">
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-secondary text-foreground shrink-0">
                  <Landmark className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-foreground truncate flex items-center gap-2">
                    {name}
                    {needs && (
                      <span
                        className="inline-block size-1.5 rounded-full bg-amber-500"
                        aria-label="Needs attention"
                      />
                    )}
                    {!needs && hasNew && (
                      <span
                        className="inline-block size-1.5 rounded-full bg-primary"
                        aria-label="New accounts available"
                      />
                    )}
                  </p>
                  {needs ? (
                    <p className="mt-0.5 text-[12px] text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="size-3 text-amber-500" />
                      Reconnect to keep TAP learning
                    </p>
                  ) : hasNew ? (
                    <p className="mt-0.5 text-[12px] text-muted-foreground flex items-center gap-1">
                      <Sparkles className="size-3 text-primary" />
                      New accounts available
                    </p>
                  ) : null}
                </div>
              </div>
              {needs ? (
                flow ? null : (
                  <button
                    type="button"
                    onClick={() => setActiveFlow({ id: it.plaid_item_id, mode: "reconnect" })}
                    className="shrink-0 h-9 px-3 rounded-full bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
                  >
                    Reconnect
                  </button>
                )
              ) : hasNew ? (
                flow ? null : (
                  <button
                    type="button"
                    onClick={() => setActiveFlow({ id: it.plaid_item_id, mode: "add_accounts" })}
                    className="shrink-0 h-9 px-3 rounded-full bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
                  >
                    Add cards
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAlsoClearMemory(false);
                    setConfirming(it.plaid_item_id);
                  }}
                  aria-label={`Disconnect ${name}`}
                  className="shrink-0 inline-flex items-center justify-center size-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            {confirming === it.plaid_item_id && (
              <div className="mt-3 rounded-xl border border-border bg-secondary/40 p-3 space-y-3">
                <p className="text-[13px] text-foreground">
                  Disconnect {name}? We'll remove your bank access token and its derived data. Your
                  wallet cards stay.
                </p>
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={alsoClearMemory}
                    onChange={(e) => setAlsoClearMemory(e.target.checked)}
                    className="size-4"
                  />
                  Also clear my merchant memory
                </label>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={busy}
                    className="h-9 px-3 rounded-full text-[13px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await unlink({
                          data: {
                            plaid_item_id: it.plaid_item_id,
                            clear_memory: alsoClearMemory,
                          },
                        });
                        toast.success("Bank disconnected.");
                        setConfirming(null);
                        refresh();
                      } catch (e) {
                        console.error(e);
                        toast.error("Couldn't disconnect.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="h-9 px-4 rounded-full bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {busy ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              </div>
            )}

            {flow === "reconnect" && (
              <div className="mt-3">
                <PlaidLinkButton
                  variant="secondary"
                  label="Continue reconnect"
                  updateForItemId={it.plaid_item_id}
                  onComplete={() => {
                    setActiveFlow(null);
                    refresh();
                  }}
                />
              </div>
            )}
            {flow === "add_accounts" && (
              <div className="mt-3">
                <PlaidLinkButton
                  variant="secondary"
                  label="Pick new accounts"
                  addAccountsForItemId={it.plaid_item_id}
                  onComplete={() => {
                    setActiveFlow(null);
                    refresh();
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
