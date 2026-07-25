import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CardCatalog, EarnRule, PointsProgram, UserCard } from "@/lib/types";
import { dollars } from "@/lib/format";
import { BottomNav } from "@/components/bottom-nav";
import { CardPlay, type CardFace } from "@/components/card-play";
import { addGuestCard, getGuestWallet, removeGuestCard } from "@/lib/guestWallet";
import { ArrowLeft, CreditCard, Plus, Search, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { toast } from "sonner";

export const Route = createFileRoute("/cards")({
  component: CardsPage,
});

type Data = {
  userCards: UserCard[];
  catalog: Record<string, CardCatalog & { is_custom?: boolean }>;
  catalogList: (CardCatalog & { is_custom?: boolean })[];
  programs: PointsProgram[];
  isGuest: boolean;
};

function CardsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<"list" | "choose" | "catalog" | "manual">("list");

  const load = async () => {
    const [cc, pp] = await Promise.all([
      supabase.from("cards_catalog").select("*").order("issuer").order("name"),
      supabase.from("points_programs").select("*").order("name"),
    ]);
    const catalog: Record<string, CardCatalog & { is_custom?: boolean }> = {};
    const catalogList = (cc.data ?? []) as unknown as (CardCatalog & { is_custom?: boolean })[];
    catalogList.forEach((c) => (catalog[c.id] = c));

    let userCards: UserCard[] = [];
    if (user) {
      const uc = await supabase
        .from("user_cards")
        .select("*")
        .order("created_at", { ascending: false });
      userCards = (uc.data ?? []) as UserCard[];
    } else {
      const g = getGuestWallet();
      userCards = g.cards.map((gc) => ({
        id: gc.id,
        user_id: "guest",
        card_catalog_id: gc.card_catalog_id,
        nickname: gc.nickname ?? null,
        opened_at: null,
        annual_fee_paid_at: null,
        created_at: "",
      })) as UserCard[];
    }

    setData({
      userCards,
      catalog,
      catalogList,
      programs: (pp.data ?? []) as PointsProgram[],
      isGuest: !user,
    });
  };

  useEffect(() => {
    if (loading) return;
    void load();
  }, [user, loading]);

  if (loading) return <div className="min-h-screen bg-background" />;

  const isEmptyList = mode === "list" && data !== null && data.userCards.length === 0;
  const showHeaderAdd = mode === "list" && !isEmptyList && data !== null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {mode !== "list" && (
            <button
              onClick={() => setMode(mode === "catalog" || mode === "manual" ? "choose" : "list")}
              className="inline-flex items-center justify-center min-h-11 min-w-11 -ml-2 text-muted-foreground hover:text-foreground"
              aria-label="Back"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          <h1 className="text-base font-semibold text-foreground">
            {mode === "list"
              ? "Wallet"
              : mode === "choose"
                ? "Add a card"
                : mode === "catalog"
                  ? "Pick from catalog"
                  : "Manual entry"}
          </h1>
        </div>
        {showHeaderAdd && (
          <button
            onClick={() => setMode(data!.isGuest ? "catalog" : "choose")}
            className="inline-flex items-center gap-1 rounded-full bg-foreground text-background text-[13px] font-medium h-11 px-4 hover:opacity-90 transition-opacity active:scale-[0.96]"
            aria-label="Add a card"
          >
            <Plus className="size-4" strokeWidth={2.25} />
            Add
          </button>
        )}
      </header>

      <main className="flex-1 px-6 py-2 max-w-md mx-auto w-full pb-8">
        {data?.isGuest && mode === "list" && !isEmptyList && (
          <div className="mb-3 rounded-xl bg-secondary/60 px-4 py-2.5">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Guest wallet — saved in this browser.{" "}
              <Link
                to="/login"
                className="text-foreground font-medium underline underline-offset-2 hover:opacity-80"
              >
                Sign in
              </Link>{" "}
              to keep it across devices.
            </p>
          </div>
        )}
        {!data ? (
          <CardListSkeleton />
        ) : mode === "list" ? (
          <CardList
            data={data}
            onChanged={load}
            onAdd={() => setMode(data.isGuest ? "catalog" : "choose")}
          />
        ) : mode === "choose" ? (
          <ChooseMode
            onCatalog={() => setMode("catalog")}
            onManual={() => setMode("manual")}
            isGuest={data.isGuest}
          />
        ) : mode === "catalog" ? (
          <CatalogPicker
            data={data}
            onAdded={async () => {
              await load();
              setMode("list");
            }}
          />
        ) : data.isGuest ? (
          <GuestManualBlocked onBack={() => setMode("choose")} />
        ) : (
          <ManualForm
            data={data}
            onSaved={async () => {
              await load();
              setMode("list");
            }}
          />
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function CardListSkeleton() {
  return (
    <ul className="space-y-3 mt-2" aria-hidden>
      {[0, 1].map((i) => (
        <li key={i}>
          <div
            className="w-full rounded-2xl bg-secondary/60 animate-pulse"
            style={{ aspectRatio: "1.586 / 1" }}
          />
          <div className="mt-2 h-3 w-32 rounded bg-secondary/60 animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

function CardList({
  data,
  onChanged,
  onAdd,
}: {
  data: Data;
  onChanged: () => void;
  onAdd: () => void;
}) {
  if (data.userCards.length === 0) {
    return (
      <div className="mt-10 text-center px-2">
        <div
          className="mx-auto w-40 rounded-2xl bg-secondary/50 flex items-center justify-center"
          style={{ aspectRatio: "1.586 / 1" }}
          aria-hidden
        >
          <CreditCard className="size-6 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <p className="mt-5 cs-title-md text-foreground">Your wallet is empty</p>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
          Add the cards you carry. TAP tells you which one to tap at checkout.
        </p>
        <button
          onClick={onAdd}
          className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground text-background text-[14px] font-medium h-12 px-6 hover:opacity-90 transition-opacity active:scale-[0.96]"
        >
          <Plus className="size-4" strokeWidth={2.25} />
          Add a card
        </button>
      </div>
    );
  }
  return (
    <ul className="space-y-3 mt-2">
      {data.userCards.map((uc) => (
        <UserCardRow key={uc.id} userCard={uc} data={data} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function UserCardRow({
  userCard,
  data,
  onChanged,
}: {
  userCard: UserCard;
  data: Data;
  onChanged: () => void;
}) {
  const card = data.catalog[userCard.card_catalog_id];
  const label = userCard.nickname ?? (card ? `${card.issuer} ${card.name}` : "Unknown card");
  const subLabel = userCard.nickname && card ? `${card.issuer} ${card.name}` : null;
  const topRules = card?.earn_rules.slice(0, 3) ?? [];

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [exiting, setExiting] = useState(false);

  const performRemove = async () => {
    if (removing) return;
    setRemoving(true);
    if (data.isGuest) {
      removeGuestCard(userCard.id);
    } else {
      const { error } = await supabase.from("user_cards").delete().eq("id", userCard.id);
      if (error) {
        toast.error(error.message);
        setRemoving(false);
        return;
      }
    }
    setConfirmOpen(false);
    setExiting(true);
    window.setTimeout(() => {
      toast.success("Card removed");
      onChanged();
    }, 220);
  };

  const programName = card?.points_program_id
    ? (data.programs.find((p) => p.id === card.points_program_id)?.name ?? null)
    : null;
  const face: CardFace = {
    name: userCard.nickname ?? card?.name ?? "Unknown card",
    issuer: card?.issuer ?? "",
    program: programName,
  };

  return (
    <li
      className="relative transition-all duration-200 ease-out"
      style={{
        opacity: exiting ? 0 : 1,
        transform: exiting ? "scale(0.94) translateY(-4px)" : "none",
      }}
    >
      <CardPlay cards={[face]} variant="ivory" animate={false} />
      <div className="mt-2 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0 flex-1">
          {subLabel && <p className="text-[11px] text-muted-foreground truncate">{subLabel}</p>}
          {card && (topRules.length > 0 || card.is_custom || card.annual_fee > 0) && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {card.is_custom && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5">
                  Custom
                </span>
              )}
              {topRules.map((r, i) => (
                <span
                  key={i}
                  className="text-[10px] bg-accent text-accent-foreground rounded-md px-1.5 py-0.5"
                >
                  {r.multiplier}x {r.category.replace(/_/g, " ")}
                </span>
              ))}
              {card.annual_fee > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  · {dollars(card.annual_fee * 100)}/yr
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center justify-center shrink-0 rounded-full min-h-11 min-w-11 text-muted-foreground hover:text-destructive hover:bg-secondary/60 transition-colors active:scale-[0.96]"
          aria-label={`Remove ${label}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <Sheet
        open={confirmOpen}
        onClose={() => (!removing ? setConfirmOpen(false) : undefined)}
        title="Remove this card?"
        busy={removing}
      >
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          {label} will no longer appear in your wallet or in recommendations. You can add it back
          anytime.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={removing}
            onClick={() => setConfirmOpen(false)}
            className="flex-1 cs-btn-secondary h-12 disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={removing}
            onClick={performRemove}
            className="flex-1 inline-flex items-center justify-center h-12 rounded-xl bg-destructive text-destructive-foreground font-medium hover:opacity-90 transition-opacity active:scale-[0.96] disabled:opacity-70"
          >
            {removing ? "Removing…" : "Remove card"}
          </button>
        </div>
      </Sheet>
    </li>
  );
}

function ChooseMode({
  onCatalog,
  onManual,
  isGuest,
}: {
  onCatalog: () => void;
  onManual: () => void;
  isGuest: boolean;
}) {
  return (
    <div className="space-y-3 mt-2">
      <button
        onClick={onCatalog}
        className="w-full text-left rounded-2xl border border-border bg-surface px-5 py-4 hover:bg-accent transition-colors"
      >
        <p className="text-sm font-semibold text-foreground">Pick from catalog</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          25 top US rewards cards. Pre-loaded earn rates. Fastest way to add common cards.
        </p>
      </button>
      <button
        onClick={onManual}
        disabled={isGuest}
        className="w-full text-left rounded-2xl border border-border bg-surface px-5 py-4 hover:bg-accent transition-colors disabled:opacity-50 disabled:hover:bg-surface"
      >
        <p className="text-sm font-semibold text-foreground">Enter manually</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {isGuest
            ? "Sign in to add custom cards not in the catalog."
            : "Custom card not in our catalog. Define your own earn rules and category multipliers."}
        </p>
      </button>
    </div>
  );
}

function GuestManualBlocked({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border-strong bg-surface p-6 text-center">
      <p className="text-sm font-medium text-foreground">Sign in required</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Custom cards are saved to your account. Sign in to add cards outside the catalog.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          onClick={onBack}
          className="rounded-full border border-border bg-surface text-xs font-medium px-3 py-1.5"
        >
          Back
        </button>
        <Link
          to="/login"
          className="rounded-full bg-foreground text-background text-xs font-medium px-3 py-1.5"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}

function CatalogPicker({ data, onAdded }: { data: Data; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CardCatalog | null>(null);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);

  const ownedIds = useMemo(
    () => new Set(data.userCards.map((c) => c.card_catalog_id)),
    [data.userCards],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return data.catalogList
      .filter((c) => !c.is_custom)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q));
  }, [data.catalogList, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, (CardCatalog & { is_custom?: boolean })[]>();
    for (const c of filtered) {
      const bucket = map.get(c.issuer) ?? [];
      bucket.push(c);
      map.set(c.issuer, bucket);
    }
    return Array.from(map.entries())
      .map(([issuer, cs]) => ({
        issuer,
        cards: cs.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.issuer.localeCompare(b.issuer));
  }, [filtered]);

  // Show the most recent rates_as_of across the catalog.
  const ratesVerified = useMemo(() => {
    const dates = data.catalogList
      .filter((c) => !c.is_custom)
      .map((c) => (c as unknown as { rates_as_of?: string }).rates_as_of)
      .filter((d): d is string => typeof d === "string" && d.length > 0)
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  }, [data.catalogList]);

  if (picked) {
    return (
      <div className="space-y-4 mt-2">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-foreground">{picked.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{picked.issuer}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {picked.earn_rules.map((r, i) => (
              <span
                key={i}
                className="text-[10px] bg-accent text-accent-foreground rounded-md px-1.5 py-0.5"
              >
                {r.multiplier}x {r.category.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>

        <Field label="Nickname (optional)">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder='e.g. "Travel card"'
            maxLength={50}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
        </Field>

        <div className="flex gap-2">
          <button
            onClick={() => setPicked(null)}
            className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-medium"
          >
            Back
          </button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              if (data.isGuest) {
                addGuestCard(picked.id, nickname.trim() || null);
                setSaving(false);
                toast.success("Card added");
                onAdded();
                return;
              }
              const { data: u } = await supabase.auth.getUser();
              const { error } = await supabase.from("user_cards").insert({
                user_id: u.user!.id,
                card_catalog_id: picked.id,
                nickname: nickname.trim() || null,
              });
              setSaving(false);
              if (error) toast.error(error.message);
              else {
                toast.success("Card added");
                onAdded();
              }
            }}
            className="flex-2 flex-1 rounded-xl bg-foreground text-background py-3 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add to wallet"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed rounded-lg border border-border bg-surface px-3 py-2">
        {ratesVerified
          ? `Rates verified ${ratesVerified}. Verify current terms with your issuer before relying on any recommendation.`
          : "Verify current terms with your issuer before relying on any recommendation."}
      </p>
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Amex, Chase, Sapphire…"
          className="w-full rounded-xl border border-border bg-surface pl-10 pr-3 py-3 text-sm"
        />
      </div>
      <div className="space-y-5">
        {grouped.map(({ issuer, cards }) => (
          <div key={issuer}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2 px-1">
              {issuer}
            </p>
            <ul className="space-y-2">
              {cards.map((c) => {
                const owned = ownedIds.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      disabled={owned}
                      onClick={() => setPicked(c)}
                      className="w-full text-left rounded-xl border border-border bg-surface px-4 py-3 hover:bg-accent transition-colors disabled:opacity-50 disabled:hover:bg-surface"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.annual_fee > 0
                              ? `${dollars(c.annual_fee * 100)}/yr`
                              : "No annual fee"}
                          </p>
                        </div>
                        {owned && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Added
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            No matches. Try a different name or enter manually.
          </p>
        )}
      </div>
    </div>
  );
}

function ManualForm({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const [issuer, setIssuer] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [annualFee, setAnnualFee] = useState("");
  const [foreignTx, setForeignTx] = useState("0");
  const [pointsProgramId, setPointsProgramId] = useState<string>("");
  const [rules, setRules] = useState<EarnRule[]>([{ category: "all", multiplier: 1 }]);
  const [saving, setSaving] = useState(false);

  const updateRule = (i: number, patch: Partial<EarnRule>) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules((rs) => [...rs, { category: "groceries", multiplier: 2 }]);
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!issuer.trim() || !name.trim()) return toast.error("Issuer and name required");
    const validRules = rules
      .map((r) => ({
        ...r,
        category: r.category.trim().toLowerCase().replace(/\s+/g, "_"),
        multiplier: Number(r.multiplier),
      }))
      .filter((r) => r.category && Number.isFinite(r.multiplier) && r.multiplier > 0);
    if (validRules.length === 0) return toast.error("Add at least one earn rule");

    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user!.id;
    const slug = `custom_${uid.slice(0, 8)}_${Date.now().toString(36)}`;

    const { error: ce } = await supabase.from("cards_catalog").insert({
      id: slug,
      user_id: uid,
      is_custom: true,
      issuer: issuer.trim(),
      name: name.trim(),
      annual_fee: parseInt(annualFee) || 0,
      foreign_tx_fee_pct: parseFloat(foreignTx) || 0,
      points_program_id: pointsProgramId || null,
      earn_rules: validRules,
      notes: null,
    });
    if (ce) {
      setSaving(false);
      toast.error(ce.message);
      return;
    }

    const { error: ue } = await supabase.from("user_cards").insert({
      user_id: uid,
      card_catalog_id: slug,
      nickname: nickname.trim() || null,
    });
    setSaving(false);
    if (ue) toast.error(ue.message);
    else {
      toast.success("Card added");
      onSaved();
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Issuer">
          <input
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="Chase"
            maxLength={50}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Card name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sapphire Reserve"
            maxLength={80}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
        </Field>
      </div>

      <Field label="Nickname (optional)">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder='e.g. "Backup"'
          maxLength={50}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Annual fee ($)">
          <input
            inputMode="numeric"
            value={annualFee}
            onChange={(e) => setAnnualFee(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
        </Field>
        <Field label="Foreign tx fee (%)">
          <input
            inputMode="decimal"
            value={foreignTx}
            onChange={(e) => setForeignTx(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
        </Field>
      </div>

      <Field label="Rewards type">
        <select
          value={pointsProgramId}
          onChange={(e) => setPointsProgramId(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
        >
          <option value="">Cashback (no program)</option>
          {data.programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.default_cpp.toFixed(2)}¢/pt)
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
          Pick the points program this card earns. Choose cashback if multipliers convert straight
          to dollars.
        </p>
      </Field>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Earn rules
          </span>
          <button
            onClick={addRule}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="size-3" />
            Add rule
          </button>
        </div>
        <ul className="space-y-2">
          {rules.map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                value={r.category}
                onChange={(e) => updateRule(i, { category: e.target.value })}
                placeholder="groceries"
                className="flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              />
              <input
                inputMode="decimal"
                value={r.multiplier}
                onChange={(e) => updateRule(i, { multiplier: parseFloat(e.target.value) || 0 })}
                placeholder="2"
                className="w-20 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-right"
              />
              <span className="text-xs text-muted-foreground">{pointsProgramId ? "x" : "%"}</span>
              <button
                onClick={() => removeRule(i)}
                disabled={rules.length === 1}
                className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-30"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          Use lowercase categories like <code className="text-[10px]">groceries</code>,{" "}
          <code className="text-[10px]">dining</code>, <code className="text-[10px]">travel</code>,{" "}
          <code className="text-[10px]">gas</code>, or <code className="text-[10px]">all</code> for
          base spend.
        </p>
      </div>

      <button
        onClick={submit}
        disabled={saving}
        className="w-full rounded-xl bg-foreground text-background py-3 text-sm font-medium disabled:opacity-50"
      >
        {saving ? "Saving…" : "Add custom card"}
      </button>
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
