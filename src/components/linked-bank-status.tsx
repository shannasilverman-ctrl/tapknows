import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle } from "lucide-react";
import { listPlaidItems } from "@/lib/plaid.functions";
import { PlaidLinkButton } from "@/components/plaid-link-button";

type Item = {
  plaid_item_id: string;
  institution_name: string | null;
  status: string | null;
  needs_attention_at: string | null;
};

/**
 * Compact row for the home/wallet screen. Renders only when at least one
 * linked bank needs reconnecting — otherwise stays fully quiet.
 */
export function LinkedBankStatus() {
  const listItems = useServerFn(listPlaidItems);
  const [items, setItems] = useState<Item[]>([]);
  const [reconnecting, setReconnecting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await listItems();
      setItems(r.items as Item[]);
    } catch {
      // stay silent
    }
  }, [listItems]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const needs = items.filter((i) => i.status === "needs_attention" || !!i.needs_attention_at);
  if (needs.length === 0) return null;

  return (
    <div className="mx-4 mb-3 space-y-2">
      {needs.map((it) => {
        const name = it.institution_name?.trim() || "Your bank";
        const isReconnecting = reconnecting === it.plaid_item_id;
        return (
          <div
            key={it.plaid_item_id}
            className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3 min-h-11">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block size-1.5 rounded-full bg-amber-500 shrink-0"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate flex items-center gap-1.5">
                    <AlertCircle className="size-3.5 text-amber-600 shrink-0" />
                    {name} needs a quick reconnect
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Reconnect to keep TAP learning
                  </p>
                </div>
              </div>
              {!isReconnecting && (
                <button
                  type="button"
                  onClick={() => setReconnecting(it.plaid_item_id)}
                  className="shrink-0 h-9 px-3 rounded-full bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity"
                >
                  Reconnect
                </button>
              )}
            </div>
            {isReconnecting && (
              <div className="mt-3">
                <PlaidLinkButton
                  variant="secondary"
                  label="Continue reconnect"
                  updateForItemId={it.plaid_item_id}
                  onComplete={() => {
                    setReconnecting(null);
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
