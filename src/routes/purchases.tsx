import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MerchantCatalog, PointsProgram } from "@/lib/types";
import { dollars, pointsFmt } from "@/lib/format";
import {
  recommend,
  resolveEarnRule,
  type EarnRule,
  type EngineCard,
  type EngineOffer,
  type Play,
  type PlayLeg,
} from "@/lib/recommendationEngine";
import { BottomNav } from "@/components/bottom-nav";
import { ArrowUpRight, Plus, Receipt, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useModalA11y } from "@/hooks/use-modal-a11y";

export const Route = createFileRoute("/purchases")({
  component: PurchasesPage,
});

type Purchase = {
  id: string;
  occurred_at: string;
  merchant_text: string;
  merchant_catalog_id: string | null;
  amount_cents: number;
  user_card_id_used: string | null;
  recommended_user_card_id: string | null;
  delta_value_cents: number;
};

type Data = {
  wallet: EngineCard[];
  programs: Record<string, PointsProgram>;
  merchants: MerchantCatalog[];
  offers: EngineOffer[];
  valuations: Record<string, number>;
  purchases: Purchase[];
};

type CatalogRow = {
  id: string;
  issuer: string;
  name: string;
  points_program_id: string | null;
  foreign_tx_fee_pct: number;
  earn_rules: EarnRule[];
};

function PurchasesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const load = async () => {
    const [uc, cc, pp, mc, uo, ov, up] = await Promise.all([
      supabase.from("user_cards").select("*"),
      supabase.from("cards_catalog").select("*"),
      supabase.from("points_programs").select("*"),
      supabase.from("merchants_catalog").select("*").order("name"),
      supabase.from("user_offers").select("*"),
      supabase.from("user_cpp_overrides").select("*"),
      supabase
        .from("user_purchases")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(50),
    ]);
    const catalog: Record<string, CatalogRow> = {};
    (cc.data ?? []).forEach((c) => {
      catalog[c.id] = { ...c, earn_rules: (c.earn_rules as unknown as EarnRule[]) ?? [] };
    });
    const programs: Record<string, PointsProgram> = {};
    const valuations: Record<string, number> = {};
    (pp.data ?? []).forEach((p) => {
      programs[p.id] = p as unknown as PointsProgram;
      valuations[p.id] = Number(p.default_cpp);
    });
    (ov.data ?? []).forEach((o) => {
      valuations[o.points_program_id] = Number(o.cpp);
    });
    setData({
      wallet: (uc.data ?? [])
        .map((c) => hydrateCard(c.id, c.card_catalog_id, c.nickname, catalog))
        .filter((c): c is EngineCard => !!c),
      programs,
      merchants: (mc.data ?? []) as MerchantCatalog[],
      offers: (uo.data ?? []).map((o) => ({
        id: o.id,
        user_card_id: o.user_card_id,
        merchant: o.merchant_text,
        offer_type:
          (o.offer_type as EngineOffer["offer_type"]) ??
          (o.reward_type === "statement_credit"
            ? "dollars_off_threshold"
            : (o.reward_type as EngineOffer["offer_type"])),
        discount_amount: Number(o.reward_value),
        spend_threshold: o.min_spend,
        max_benefit: o.max_benefit != null ? Number(o.max_benefit) : null,
        expires_on: o.expires_at,
        is_used: o.is_used ?? false,
      })),
      valuations,
      purchases: (up.data ?? []) as Purchase[],
    });
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const totals = useMemo(() => {
    const earned = data?.purchases.reduce((s, _p) => s, 0) ?? 0; // placeholder
    const spent = data?.purchases.reduce((s, p) => s + p.amount_cents, 0) ?? 0;
    const missed = data?.purchases.reduce((s, p) => s + Math.max(0, p.delta_value_cents), 0) ?? 0;
    return { earned, spent, missed };
  }, [data]);

  if (loading || !user) return <div className="min-h-screen bg-background" />;

  return (
    <div className="cs-app-body tap-consumer-screen min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-foreground">Purchase log</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded-full bg-foreground text-background text-xs font-medium px-3 py-1.5 hover:opacity-90 transition-opacity"
        >
          <Plus className="size-3.5" />
          Log
        </button>
      </header>

      <main className="flex-1 px-6 py-2 max-w-md mx-auto w-full pb-8">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat label="Logged spend" value={dollars(totals.spent)} />
          <Stat
            label="Left on the table"
            value={dollars(totals.missed)}
            accent={totals.missed > 0}
          />
        </div>

        {!data ? null : data.purchases.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : (
          <ul className="space-y-2">
            {data.purchases.map((p) => (
              <PurchaseRow key={p.id} purchase={p} data={data} onChanged={load} />
            ))}
          </ul>
        )}
      </main>

      {showAdd && data && (
        <LogPurchaseSheet
          data={data}
          onClose={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false);
            await load();
          }}
        />
      )}

      <BottomNav />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl border bg-surface px-4 py-3 ${
        accent ? "border-destructive/40" : "border-border"
      }`}
    >
      <p
        className={`text-xl font-semibold tabular-nums ${
          accent ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function cardLabel(userCardId: string | null, data: Data) {
  if (!userCardId) return "—";
  const card = data.wallet.find((c) => c.id === userCardId);
  if (!card) return "Removed card";
  return card.nickname ?? `${card.issuer} ${card.name}`;
}

function PurchaseRow({
  purchase,
  data,
  onChanged,
}: {
  purchase: Purchase;
  data: Data;
  onChanged: () => void;
}) {
  const used = cardLabel(purchase.user_card_id_used, data);
  const best = purchase.recommended_user_card_id
    ? cardLabel(purchase.recommended_user_card_id, data)
    : null;
  const wasBest =
    !purchase.recommended_user_card_id ||
    purchase.recommended_user_card_id === purchase.user_card_id_used ||
    purchase.delta_value_cents <= 0;

  const remove = async () => {
    const { error } = await supabase.from("user_purchases").delete().eq("id", purchase.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Removed");
      onChanged();
    }
  };

  const date = new Date(purchase.occurred_at);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <li className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-medium text-foreground truncate">{purchase.merchant_text}</p>
            <span className="text-[11px] text-muted-foreground">{dateStr}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">on {used}</p>
        </div>
        <div className="text-right shrink-0 flex items-start gap-2">
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {dollars(purchase.amount_cents)}
          </p>
          <button
            onClick={remove}
            className="text-muted-foreground hover:text-destructive p-1 -mr-1 -mt-0.5"
            aria-label="Remove"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {wasBest ? (
        <p className="mt-2 text-[11px] text-success">Best card used.</p>
      ) : (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
          <ArrowUpRight className="size-3" />
          <span>
            {dollars(purchase.delta_value_cents)} more with {best}
          </span>
        </div>
      )}
    </li>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border-strong bg-surface p-8 text-center">
      <Receipt className="size-5 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">No purchases yet.</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Log a past transaction to track what you earned and what you would've earned with your best
        card.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1 rounded-full bg-foreground text-background text-xs font-medium px-3 py-1.5 hover:opacity-90"
      >
        <Plus className="size-3.5" />
        Log purchase
      </button>
    </div>
  );
}

function LogPurchaseSheet({
  data,
  onClose,
  onSaved,
}: {
  data: Data;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [merchantId, setMerchantId] = useState<string>("");
  const [merchantText, setMerchantText] = useState("");
  const [merchantCategory, setMerchantCategory] = useState("other");
  const [amountStr, setAmountStr] = useState("");
  const [userCardId, setUserCardId] = useState(data.wallet[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const onPickMerchant = (id: string) => {
    setMerchantId(id);
    const m = data.merchants.find((x) => x.id === id);
    if (m) {
      setMerchantText(m.name);
      setMerchantCategory(m.category);
    }
  };

  const amountCents = useMemo(() => {
    const n = parseFloat(amountStr);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  }, [amountStr]);

  const preview = useMemo<{
    used: {
      play: Play;
      leg: PlayLeg;
      programId: string | null;
      rewardKind: "points" | "cashback";
      pointsEarned: number;
    } | null;
    winner: Play | null;
    delta: number;
  }>(() => {
    if (!userCardId || amountCents === 0) return { used: null, winner: null, delta: 0 };
    const usedCard = data.wallet.find((card) => card.id === userCardId);
    if (!usedCard) return { used: null, winner: null, delta: 0 };

    const engineInput = {
      amountCents,
      category: merchantCategory,
      merchant: merchantText.trim() || null,
      offers: data.offers,
      valuations: data.valuations,
    };
    const winner = recommend({ ...engineInput, wallet: data.wallet }).winner;
    const usedPlay = recommend({ ...engineInput, wallet: [usedCard] }).winner;
    const usedLeg = usedPlay?.legs[0] ?? null;
    const programId = usedCard.points_program_id;
    const program = programId ? data.programs[programId] : null;
    const rewardKind: "points" | "cashback" = program?.kind === "cashback" ? "cashback" : "points";
    const pointsEarned =
      usedPlay && usedLeg && programId && rewardKind === "points"
        ? Math.round((amountCents / 100) * resolveEarnRule(usedCard, merchantCategory).multiplier)
        : 0;
    const used =
      usedPlay && usedLeg
        ? { play: usedPlay, leg: usedLeg, programId, rewardKind, pointsEarned }
        : null;
    const delta =
      winner && used ? Math.max(0, winner.totalValueCents - used.play.totalValueCents) : 0;
    return { used, winner, delta };
  }, [userCardId, amountCents, merchantText, merchantCategory, data]);

  const submit = async () => {
    if (!userCardId) return toast.error("Pick the card you used");
    if (!merchantText.trim()) return toast.error("Enter a merchant");
    if (amountCents === 0) return toast.error("Enter an amount");

    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user!.id;

    const { error } = await supabase.from("user_purchases").insert({
      user_id: uid,
      occurred_at: new Date(occurredAt).toISOString(),
      merchant_text: merchantText.trim(),
      merchant_catalog_id: merchantId || null,
      amount_cents: amountCents,
      user_card_id_used: userCardId,
      recommended_user_card_id: preview.winner?.legs[0]?.userCardId ?? null,
      delta_value_cents: preview.delta,
    });

    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }

    // Bump points balance if applicable
    if (
      preview.used &&
      preview.used.rewardKind === "points" &&
      preview.used.pointsEarned > 0 &&
      preview.used.programId
    ) {
      const programId = preview.used.programId;
      const { data: existing } = await supabase
        .from("user_points_balances")
        .select("id, balance")
        .eq("points_program_id", programId)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("user_points_balances")
          .update({
            balance: existing.balance + preview.used.pointsEarned,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("user_points_balances").insert({
          user_id: uid,
          points_program_id: programId,
          balance: preview.used.pointsEarned,
        });
      }
    }

    // Bump signup bonus progress for the card used
    const { data: openBonuses } = await supabase
      .from("user_signup_bonuses")
      .select("id, spend_so_far, spend_required")
      .eq("user_card_id", userCardId);
    if (openBonuses) {
      for (const b of openBonuses) {
        if (b.spend_so_far < b.spend_required) {
          await supabase
            .from("user_signup_bonuses")
            .update({ spend_so_far: b.spend_so_far + Math.round(amountCents / 100) })
            .eq("id", b.id);
        }
      }
    }

    setSaving(false);
    toast.success("Logged");
    onSaved();
  };

  const noCards = data.wallet.length === 0;

  const { modalProps } = useModalA11y(onClose, "Log purchase");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/30">
      <div
        {...modalProps}
        className="w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-2xl border border-border max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-background px-6 pt-5 pb-3 flex items-center justify-between border-b border-border">
          <h3 className="text-base font-semibold">Log purchase</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {noCards ? (
            <p className="text-sm text-muted-foreground">Add a card first.</p>
          ) : (
            <>
              <Field label="Merchant">
                <select
                  value={merchantId}
                  onChange={(e) => onPickMerchant(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm mb-2"
                >
                  <option value="">— Pick from catalog (optional) —</option>
                  {data.merchants.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input
                  value={merchantText}
                  onChange={(e) => setMerchantText(e.target.value)}
                  placeholder="Merchant name"
                  maxLength={120}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                />
              </Field>

              {!merchantId && (
                <Field label="Category">
                  <select
                    value={merchantCategory}
                    onChange={(e) => setMerchantCategory(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount ($)">
                  <input
                    inputMode="decimal"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                  />
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                  />
                </Field>
              </div>

              <Field label="Card used">
                <select
                  value={userCardId}
                  onChange={(e) => setUserCardId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                >
                  {data.wallet.map((card) => {
                    const label = card.nickname ?? `${card.issuer} ${card.name}`;
                    return (
                      <option key={card.id} value={card.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </Field>

              {preview.used && (
                <div className="rounded-xl border border-border bg-accent/40 p-4 text-xs">
                  <p className="text-foreground leading-relaxed">{preview.used.play.headline}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-muted-foreground">You'll earn</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {dollars(preview.used.play.totalValueCents)}
                      {preview.used.rewardKind === "points" && preview.used.pointsEarned > 0 && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          ({pointsFmt(preview.used.pointsEarned)} pts)
                        </span>
                      )}
                    </span>
                  </div>
                  {preview.winner && preview.delta > 0 && (
                    <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-destructive">
                      <span>
                        Best was {cardLabel(preview.winner.legs[0]?.userCardId ?? null, data)}
                      </span>
                      <span className="font-medium tabular-nums">+{dollars(preview.delta)}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={submit}
                disabled={saving}
                className="w-full rounded-xl bg-foreground text-background py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Log purchase"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CATEGORIES = [
  "groceries",
  "dining",
  "gas",
  "travel",
  "flights",
  "hotels",
  "transit",
  "rideshare",
  "streaming",
  "drugstore",
  "online",
  "other",
];

function hydrateCard(
  id: string,
  card_catalog_id: string,
  nickname: string | null | undefined,
  catalog: Record<string, CatalogRow>,
): EngineCard | null {
  const card = catalog[card_catalog_id];
  if (!card) return null;
  return {
    id,
    card_catalog_id,
    nickname: nickname ?? null,
    issuer: card.issuer,
    name: card.name,
    points_program_id: card.points_program_id,
    foreign_tx_fee_pct: Number(card.foreign_tx_fee_pct),
    earn_rules: card.earn_rules ?? [],
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
