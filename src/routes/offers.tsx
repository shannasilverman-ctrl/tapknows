import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CardCatalog, MerchantCatalog, UserCard, UserOffer } from "@/lib/types";
import { dollars } from "@/lib/format";
import { BottomNav } from "@/components/bottom-nav";
import { Plus, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useModalA11y } from "@/hooks/use-modal-a11y";

export const Route = createFileRoute("/offers")({
  component: OffersPage,
});

type Purchase = {
  id: string;
  merchant_catalog_id: string | null;
  merchant_text: string;
  occurred_at: string;
};

type Data = {
  offers: UserOffer[];
  userCards: UserCard[];
  catalog: Record<string, CardCatalog>;
  merchants: MerchantCatalog[];
  purchases: Purchase[];
};

function OffersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const load = async () => {
    const [uo, uc, cc, mc, up] = await Promise.all([
      supabase
        .from("user_offers")
        .select("*")
        .order("expires_at", { ascending: true, nullsFirst: false }),
      supabase.from("user_cards").select("*"),
      supabase.from("cards_catalog").select("*"),
      supabase.from("merchants_catalog").select("*").order("name"),
      supabase
        .from("user_purchases")
        .select("id, merchant_catalog_id, merchant_text, occurred_at")
        .gte("occurred_at", new Date(Date.now() - 90 * 86400_000).toISOString()),
    ]);
    const catalog: Record<string, CardCatalog> = {};
    (cc.data ?? []).forEach((c: any) => (catalog[c.id] = c));
    setData({
      offers: (uo.data ?? []) as UserOffer[],
      userCards: (uc.data ?? []) as UserCard[],
      catalog,
      merchants: (mc.data ?? []) as MerchantCatalog[],
      purchases: (up.data ?? []) as Purchase[],
    });
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const recentMerchantIds = useMemo(() => {
    const s = new Set<string>();
    data?.purchases.forEach((p) => p.merchant_catalog_id && s.add(p.merchant_catalog_id));
    return s;
  }, [data]);

  const grouped = useMemo(() => {
    const now = Date.now();
    const soon: UserOffer[] = [];
    const active: UserOffer[] = [];
    const expired: UserOffer[] = [];
    (data?.offers ?? []).forEach((o) => {
      if (!o.expires_at) {
        active.push(o);
        return;
      }
      const t = new Date(o.expires_at).getTime();
      if (t < now) expired.push(o);
      else if (t - now <= 14 * 86400_000) soon.push(o);
      else active.push(o);
    });
    return { soon, active, expired };
  }, [data]);

  if (loading || !user) return <div className="min-h-screen bg-background" />;

  const totalActive = grouped.soon.length + grouped.active.length;
  const matchCount =
    data?.offers.filter(
      (o) => o.merchant_catalog_id && recentMerchantIds.has(o.merchant_catalog_id),
    ).length ?? 0;

  return (
    <div className="cs-app-body tap-consumer-screen min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-foreground">Offers</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1 rounded-full bg-foreground text-background text-xs font-medium px-3 py-1.5 hover:opacity-90 transition-opacity"
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </header>

      <main className="flex-1 px-6 py-2 max-w-md mx-auto w-full pb-8">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Stat label="Active offers" value={totalActive.toString()} />
          <Stat label="Match your spend" value={matchCount.toString()} accent={matchCount > 0} />
        </div>

        {!data ? null : data.offers.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : (
          <div className="space-y-7">
            {grouped.soon.length > 0 && (
              <Section title="Expiring soon" hint="Within 14 days">
                {grouped.soon.map((o) => (
                  <OfferRow
                    key={o.id}
                    offer={o}
                    data={data}
                    matches={
                      !!o.merchant_catalog_id && recentMerchantIds.has(o.merchant_catalog_id)
                    }
                    onChanged={load}
                  />
                ))}
              </Section>
            )}
            {grouped.active.length > 0 && (
              <Section title="Active">
                {grouped.active.map((o) => (
                  <OfferRow
                    key={o.id}
                    offer={o}
                    data={data}
                    matches={
                      !!o.merchant_catalog_id && recentMerchantIds.has(o.merchant_catalog_id)
                    }
                    onChanged={load}
                  />
                ))}
              </Section>
            )}
            {grouped.expired.length > 0 && (
              <Section title="Expired">
                {grouped.expired.map((o) => (
                  <OfferRow
                    key={o.id}
                    offer={o}
                    data={data}
                    matches={false}
                    expired
                    onChanged={load}
                  />
                ))}
              </Section>
            )}
          </div>
        )}
      </main>

      {showAdd && data && (
        <AddOfferSheet
          data={data}
          onClose={() => setShowAdd(false)}
          onAdded={async () => {
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
        accent ? "border-primary/40" : "border-border"
      }`}
    >
      <p
        className={`text-2xl font-semibold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2 px-1">
        <h2 className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          {title}
        </h2>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function rewardLabel(o: UserOffer) {
  if (o.reward_type === "multiplier") return `${o.reward_value}x points`;
  if (o.reward_type === "percent_back") return `${o.reward_value}% back`;
  return `${dollars(Math.round(Number(o.reward_value) * 100))} credit`;
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / 86400_000);
}

function OfferRow({
  offer,
  data,
  matches,
  expired,
  onChanged,
}: {
  offer: UserOffer;
  data: Data;
  matches: boolean;
  expired?: boolean;
  onChanged: () => void;
}) {
  const userCard = data.userCards.find((c) => c.id === offer.user_card_id);
  const card = userCard ? data.catalog[userCard.card_catalog_id] : null;
  const cardLabel = userCard?.nickname ?? (card ? `${card.issuer} ${card.name}` : "Unknown card");
  const days = daysUntil(offer.expires_at);

  const remove = async () => {
    const { error } = await supabase.from("user_offers").delete().eq("id", offer.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Offer removed");
      onChanged();
    }
  };

  return (
    <li
      className={`rounded-xl border bg-surface px-4 py-3 ${
        expired ? "opacity-60" : matches ? "border-primary/40" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{offer.merchant_text}</p>
            {matches && !expired && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5">
                <Tag className="size-2.5" />
                Likely match
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{cardLabel}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-foreground/80">
            <span className="font-medium">{rewardLabel(offer)}</span>
            {offer.min_spend > 0 && (
              <span className="text-muted-foreground">· min {dollars(offer.min_spend * 100)}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          {offer.expires_at && (
            <p
              className={`text-[11px] tabular-nums ${
                expired
                  ? "text-muted-foreground"
                  : days !== null && days <= 14
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              {expired ? "expired" : days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`}
            </p>
          )}
          <button
            onClick={remove}
            className="text-muted-foreground hover:text-destructive p-1 -mr-1"
            aria-label="Remove offer"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border-strong bg-surface p-8 text-center">
      <Tag className="size-5 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">No offers yet.</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Add Amex Offers, Chase Offers, or any targeted promo — we'll surface them when you pay.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1 rounded-full bg-foreground text-background text-xs font-medium px-3 py-1.5 hover:opacity-90"
      >
        <Plus className="size-3.5" />
        Add your first offer
      </button>
    </div>
  );
}

function AddOfferSheet({
  data,
  onClose,
  onAdded,
}: {
  data: Data;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [userCardId, setUserCardId] = useState(data.userCards[0]?.id ?? "");
  const [merchantId, setMerchantId] = useState<string>("");
  const [merchantText, setMerchantText] = useState("");
  const [rewardType, setRewardType] = useState<"percent_back" | "multiplier" | "statement_credit">(
    "percent_back",
  );
  const [rewardValue, setRewardValue] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  const onPickMerchant = (id: string) => {
    setMerchantId(id);
    const m = data.merchants.find((x) => x.id === id);
    if (m) setMerchantText(m.name);
  };

  const submit = async () => {
    if (!userCardId) return toast.error("Pick a card");
    if (!merchantText.trim()) return toast.error("Enter a merchant");
    const v = parseFloat(rewardValue);
    if (!Number.isFinite(v) || v <= 0) return toast.error("Reward value required");
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("user_offers").insert({
      user_id: userRes.user!.id,
      user_card_id: userCardId,
      merchant_catalog_id: merchantId || null,
      merchant_text: merchantText.trim(),
      reward_type: rewardType,
      reward_value: v,
      min_spend: parseInt(minSpend) || 0,
      expires_at: expiresAt || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Offer added");
      onAdded();
    }
  };

  const noCards = data.userCards.length === 0;

  const { modalProps } = useModalA11y(onClose, "Add offer");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/30">
      <div
        {...modalProps}
        className="w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-2xl border border-border max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-background px-6 pt-5 pb-3 flex items-center justify-between border-b border-border">
          <h3 className="text-base font-semibold">Add offer</h3>
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
            <p className="text-sm text-muted-foreground">Add a card first before adding offers.</p>
          ) : (
            <>
              <Field label="Card">
                <select
                  value={userCardId}
                  onChange={(e) => setUserCardId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                >
                  {data.userCards.map((uc) => {
                    const c = data.catalog[uc.card_catalog_id];
                    const label = uc.nickname ?? (c ? `${c.issuer} ${c.name}` : uc.card_catalog_id);
                    return (
                      <option key={uc.id} value={uc.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </Field>

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
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                />
              </Field>

              <Field label="Reward">
                <div className="flex gap-2">
                  <select
                    value={rewardType}
                    onChange={(e) => setRewardType(e.target.value as any)}
                    className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm flex-1"
                  >
                    <option value="percent_back">% back</option>
                    <option value="multiplier">x points</option>
                    <option value="statement_credit">$ credit</option>
                  </select>
                  <input
                    inputMode="decimal"
                    value={rewardValue}
                    onChange={(e) => setRewardValue(e.target.value)}
                    placeholder={rewardType === "statement_credit" ? "10" : "5"}
                    className="w-24 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-right"
                  />
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Min spend ($)">
                  <input
                    inputMode="numeric"
                    value={minSpend}
                    onChange={(e) => setMinSpend(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                  />
                </Field>
                <Field label="Expires">
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                  />
                </Field>
              </div>

              <button
                onClick={submit}
                disabled={saving}
                className="w-full rounded-xl bg-foreground text-background py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add offer"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
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
