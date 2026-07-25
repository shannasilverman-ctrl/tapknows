import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import type { UtilizationBehavior } from "@/lib/utilizationFilter";
import {
  getGuestWallet,
  setGuestPrefs,
  setGuestAccount,
  removeGuestAccount,
} from "@/lib/guestWallet";

type CardRow = { id: string; label: string };
type AccountRow = {
  user_card_id: string;
  credit_limit_cents: number | null;
  current_balance_cents: number | null;
  source: "plaid" | "manual";
};

type Prefs = {
  utilization_enabled: boolean;
  utilization_threshold_pct: number;
  utilization_behavior: UtilizationBehavior;
};

const DEFAULT_PREFS: Prefs = {
  utilization_enabled: false,
  utilization_threshold_pct: 10,
  utilization_behavior: "warn",
};

export function CreditHealthSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [accounts, setAccounts] = useState<Record<string, AccountRow>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      if (user) {
        const [p, uc, ua] = await Promise.all([
          supabase.from("user_prefs").select("*").maybeSingle(),
          supabase.from("user_cards").select("id, nickname, card_catalog_id"),
          supabase.from("user_card_accounts").select("*"),
        ]);
        if (p.data) {
          setPrefs({
            utilization_enabled: !!p.data.utilization_enabled,
            utilization_threshold_pct: p.data.utilization_threshold_pct ?? 10,
            utilization_behavior: (p.data.utilization_behavior as UtilizationBehavior) ?? "warn",
          });
        }
        // hydrate card labels
        const catIds = (uc.data ?? []).map((c: any) => c.card_catalog_id);
        const catalog = catIds.length
          ? await supabase.from("cards_catalog").select("id, issuer, name").in("id", catIds)
          : { data: [] as any[] };
        const catLookup: Record<string, { issuer: string; name: string }> = {};
        (catalog.data ?? []).forEach((c: any) => {
          catLookup[c.id] = { issuer: c.issuer, name: c.name };
        });
        setCards(
          (uc.data ?? []).map((c: any) => {
            const meta = catLookup[c.card_catalog_id];
            return {
              id: c.id,
              label: c.nickname || (meta ? `${meta.issuer} ${meta.name}` : "Card"),
            };
          }),
        );
        const accMap: Record<string, AccountRow> = {};
        (ua.data ?? []).forEach((a: any) => {
          if (!a.user_card_id) return;
          accMap[a.user_card_id] = {
            user_card_id: a.user_card_id,
            credit_limit_cents: a.credit_limit_cents,
            current_balance_cents: a.current_balance_cents,
            source: a.source,
          };
        });
        setAccounts(accMap);
      } else {
        const gw = getGuestWallet();
        setPrefs(gw.prefs);
        setCards(gw.cards.map((c) => ({ id: c.id, label: c.nickname || c.card_catalog_id })));
        const accMap: Record<string, AccountRow> = {};
        gw.accounts.forEach((a) => {
          accMap[a.user_card_id] = {
            user_card_id: a.user_card_id,
            credit_limit_cents: a.credit_limit_cents,
            current_balance_cents: a.current_balance_cents,
            source: "manual",
          };
        });
        setAccounts(accMap);
      }
      setLoaded(true);
    })();
  }, [user]);

  const savePrefs = async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (user) {
      const { error } = await supabase
        .from("user_prefs")
        .upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() });
      if (error) toast.error(error.message);
    } else {
      setGuestPrefs(patch);
    }
  };

  const saveAccount = async (cardId: string, limit: number | null, balance: number | null) => {
    setAccounts((a) => ({
      ...a,
      [cardId]: {
        user_card_id: cardId,
        credit_limit_cents: limit,
        current_balance_cents: balance,
        source: "manual",
      },
    }));
    if (user) {
      const existing = accounts[cardId];
      if (existing) {
        await supabase
          .from("user_card_accounts")
          .update({
            credit_limit_cents: limit,
            current_balance_cents: balance,
            synced_at: new Date().toISOString(),
          })
          .eq("user_card_id", cardId)
          .eq("user_id", user.id);
      } else {
        await supabase.from("user_card_accounts").insert({
          user_id: user.id,
          user_card_id: cardId,
          credit_limit_cents: limit,
          current_balance_cents: balance,
          source: "manual",
        });
      }
      toast.success("Saved");
    } else {
      setGuestAccount(cardId, limit, balance);
      toast.success("Saved");
    }
  };

  const clearAccount = async (cardId: string) => {
    setAccounts((a) => {
      const { [cardId]: _, ...rest } = a;
      return rest;
    });
    if (user) {
      await supabase
        .from("user_card_accounts")
        .delete()
        .eq("user_card_id", cardId)
        .eq("user_id", user.id);
    } else {
      removeGuestAccount(cardId);
    }
  };

  if (!loaded) return null;

  return (
    <section className="mt-10 pt-8 border-t border-border">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Credit health</p>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Factor utilization into recommendations
      </h2>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        Off by default. When on, TAP considers each card's projected utilization and can warn,
        re-rank, or suggest a split so no single card goes over your cap.
      </p>

      <div className="mt-4 rounded-xl border border-border bg-surface divide-y divide-border">
        <label className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-foreground">Enable utilization filter</span>
          <input
            type="checkbox"
            checked={prefs.utilization_enabled}
            onChange={(e) => savePrefs({ utilization_enabled: e.target.checked })}
            className="size-4 accent-foreground"
          />
        </label>

        <div
          className={`px-4 py-3 ${prefs.utilization_enabled ? "" : "opacity-50 pointer-events-none"}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-foreground">Utilization cap</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {prefs.utilization_threshold_pct}%
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={prefs.utilization_threshold_pct}
            onChange={(e) => savePrefs({ utilization_threshold_pct: Number(e.target.value) })}
            className="w-full accent-foreground"
          />
        </div>

        <div
          className={`px-4 py-3 ${prefs.utilization_enabled ? "" : "opacity-50 pointer-events-none"}`}
        >
          <p className="text-sm text-foreground mb-2">When a play would exceed the cap</p>
          <div className="flex flex-wrap gap-1.5">
            {(["warn", "rerank", "split"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => savePrefs({ utilization_behavior: b })}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  prefs.utilization_behavior === b
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {b === "warn" ? "Warn" : b === "rerank" ? "Re-rank" : "Suggest split"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`mt-6 ${prefs.utilization_enabled ? "" : "opacity-60"}`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Card limits & balances
          </p>
          {user && (
            <button
              type="button"
              onClick={() => toast("Plaid link coming soon — enter limits manually for now.")}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Link with Plaid
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Enter each card's credit limit and current balance. Cards without a limit are treated as
          unconstrained.
        </p>
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a card first.</p>
        ) : (
          <ul className="space-y-2">
            {cards.map((c) => (
              <AccountRowEditor
                key={c.id}
                card={c}
                account={accounts[c.id]}
                onSave={saveAccount}
                onClear={clearAccount}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AccountRowEditor({
  card,
  account,
  onSave,
  onClear,
}: {
  card: CardRow;
  account?: AccountRow;
  onSave: (cardId: string, limit: number | null, balance: number | null) => void;
  onClear: (cardId: string) => void;
}) {
  const [limit, setLimit] = useState(
    account?.credit_limit_cents != null ? String(account.credit_limit_cents / 100) : "",
  );
  const [balance, setBalance] = useState(
    account?.current_balance_cents != null ? String(account.current_balance_cents / 100) : "",
  );

  const parse = (s: string): number | null => {
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  };

  const pct =
    account?.credit_limit_cents && account.credit_limit_cents > 0
      ? Math.round(((account.current_balance_cents ?? 0) / account.credit_limit_cents) * 100)
      : null;

  return (
    <li className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-foreground truncate">{card.label}</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {pct != null ? `${pct}% used` : "no limit set"}
        </p>
      </div>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Limit
          </span>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              $
            </span>
            <input
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="5000"
              className="w-full rounded-lg border border-border bg-background pl-6 pr-2 py-1.5 text-sm tabular-nums"
            />
          </div>
        </label>
        <label className="flex-1">
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Balance
          </span>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              $
            </span>
            <input
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-border bg-background pl-6 pr-2 py-1.5 text-sm tabular-nums"
            />
          </div>
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2 justify-end">
        {account && (
          <button
            type="button"
            onClick={() => {
              setLimit("");
              setBalance("");
              onClear(card.id);
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => onSave(card.id, parse(limit), parse(balance))}
          className="text-xs font-medium rounded-lg bg-foreground text-background px-2.5 py-1.5"
        >
          Save
        </button>
      </div>
    </li>
  );
}
