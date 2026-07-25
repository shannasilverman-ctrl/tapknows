import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  recommend,
  deltaVsBestSingleCents,
  type EarnRule,
  type EngineCard,
  type EngineOffer,
  type EngineOutput,
} from "@/lib/recommendationEngine";
import type { MerchantCatalog, PointsProgram } from "@/lib/types";
import { dollars } from "@/lib/format";
import { BottomNav } from "@/components/bottom-nav";
import { AssumptionNote } from "@/components/assumption-note";
import { CardPlay, type CardFace } from "@/components/card-play";
import { getGuestWallet } from "@/lib/guestWallet";
import { computeWalletUpsell, type WalletUpsell } from "@/lib/walletUpsell";
import {
  applyUtilization,
  type AccountSnapshot,
  type UtilizationBehavior,
  type UtilizationOutput,
} from "@/lib/utilizationFilter";

import { toast } from "sonner";
import { Bookmark, ChevronDown, Globe, Loader2, MapPin, Search } from "lucide-react";
import { searchMerchants } from "@/lib/merchantMap";
import {
  browserGetPosition,
  requestNearby,
  resolveCandidate,
  type NearbyCandidate,
} from "@/lib/nearby";
import { fetchNearbyMerchantsFn } from "@/lib/nearby.functions";
import {
  getMerchantCategory,
  setMerchantCategory,
  clearMerchantCategory,
} from "@/lib/merchantCategoryMemo";
import { capReachedByCardMap, type CapPeriod } from "@/lib/capReached";

export const Route = createFileRoute("/plan")({
  component: PlanPage,
});

type CatalogRow = {
  id: string;
  issuer: string;
  name: string;
  points_program_id: string | null;
  foreign_tx_fee_pct: number;
  earn_rules: EarnRule[];
  annual_fee: number;
  notes: string | null;
  rates_as_of?: string;
};

type Loaded = {
  wallet: EngineCard[];
  offers: EngineOffer[];
  merchants: MerchantCatalog[];
  programs: Record<string, PointsProgram>;
  valuations: Record<string, number>;
  catalog: Record<string, CatalogRow>;
  accounts: Record<string, AccountSnapshot>;
  perCardOverrides: Record<string, number>;
  prefs: {
    utilization_enabled: boolean;
    utilization_threshold_pct: number;
    utilization_behavior: UtilizationBehavior;
  };
};

type SavedPlan = {
  id: string;
  merchant_text: string;
  amount_cents: number;
  category: string | null;
  occurred_at: string;
};

const CATEGORIES = [
  "dining",
  "groceries",
  "hotels",
  "flights",
  "travel",
  "gas",
  "drugstores",
  "streaming",
  "online_shopping",
  "everything_else",
];

function PlanPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [merchantQuery, setMerchantQuery] = useState("");
  const [merchant, setMerchant] = useState<MerchantCatalog | null>(null);
  const [category, setCategory] = useState<string>("everything_else");
  const [foreign, setForeign] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyCandidates, setNearbyCandidates] = useState<NearbyCandidate[]>([]);
  const [nearbyMessage, setNearbyMessage] = useState<string | null>(null);
  const merchantInputRef = useRef<HTMLInputElement>(null);

  const handleNearMe = async () => {
    setNearbyLoading(true);
    setNearbyMessage(null);
    const result = await requestNearby({
      getPosition: browserGetPosition,
      fetchCandidates: async (coords) => {
        const res = await fetchNearbyMerchantsFn({ data: coords });
        return res.candidates;
      },
      timeoutMs: 10_000,
    });
    setNearbyLoading(false);
    if (result.ok) {
      setNearbyCandidates(result.candidates.slice(0, 5));
      return;
    }
    setNearbyCandidates([]);
    const msg =
      result.error === "denied"
        ? "No problem — search for the store instead."
        : "Couldn't find nearby stores — search for it instead.";
    setNearbyMessage(msg);
    setTimeout(() => merchantInputRef.current?.focus(), 0);
  };

  const pickCandidate = (c: NearbyCandidate) => {
    const resolved = resolveCandidate(c.name);
    if (resolved) {
      setMerchant({
        id: resolved.id,
        name: resolved.name,
        category: resolved.category,
        aliases: resolved.aliases,
      });
      setMerchantQuery("");
    } else {
      setMerchant(null);
      setMerchantQuery(c.name);
      setTimeout(() => merchantInputRef.current?.focus(), 0);
    }
    setNearbyCandidates([]);
    setNearbyMessage(null);
  };

  useEffect(() => {
    if (loading) return;
    (async () => {
      const [cc, pp, mc] = await Promise.all([
        supabase.from("cards_catalog").select("*"),
        supabase.from("points_programs").select("*"),
        supabase.from("merchants_catalog").select("*"),
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

      let wallet: EngineCard[] = [];
      let offers: EngineOffer[] = [];
      const accounts: Record<string, AccountSnapshot> = {};
      const perCardOverrides: Record<string, number> = {};
      let prefs = {
        utilization_enabled: false,
        utilization_threshold_pct: 10,
        utilization_behavior: "warn" as UtilizationBehavior,
      };
      if (user) {
        const [uc, uo, ov, ua, up] = await Promise.all([
          supabase.from("user_cards").select("*"),
          supabase.from("user_offers").select("*"),
          supabase.from("user_cpp_overrides").select("*"),
          supabase.from("user_card_accounts").select("*"),
          supabase.from("user_prefs").select("*").maybeSingle(),
        ]);
        wallet = (uc.data ?? [])
          .map((c) => hydrateCard(c.id, c.card_catalog_id, c.nickname, catalog))
          .filter((c): c is EngineCard => !!c);
        (uc.data ?? []).forEach((c: any) => {
          if (c.utilization_override_pct != null) {
            perCardOverrides[c.id] = c.utilization_override_pct / 100;
          }
        });
        offers = (uo.data ?? []).map((o) => ({
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
        }));
        (ov.data ?? []).forEach((o) => {
          valuations[o.points_program_id] = Number(o.cpp);
        });
        (ua.data ?? []).forEach((a: any) => {
          if (!a.user_card_id) return;
          if (a.credit_limit_cents == null) return;
          accounts[a.user_card_id] = {
            limitCents: Number(a.credit_limit_cents),
            balanceCents: Number(a.current_balance_cents ?? 0),
          };
        });
        if (up.data) {
          prefs = {
            utilization_enabled: !!up.data.utilization_enabled,
            utilization_threshold_pct: up.data.utilization_threshold_pct ?? 10,
            utilization_behavior: (up.data.utilization_behavior as UtilizationBehavior) ?? "warn",
          };
        }
      } else {
        // Guest mode
        const g = getGuestWallet();
        wallet = g.cards
          .map((gc) => hydrateCard(gc.id, gc.card_catalog_id, gc.nickname, catalog))
          .filter((c): c is EngineCard => !!c);
        offers = g.offers.map((o) => ({
          id: o.id,
          user_card_id: o.user_card_id,
          merchant: o.merchant_text,
          offer_type: o.offer_type,
          discount_amount: o.reward_value,
          spend_threshold: o.min_spend,
          max_benefit: o.max_benefit ?? null,
          expires_on: o.expires_at ?? null,
        }));
        g.overrides.forEach((ov) => {
          valuations[ov.points_program_id] = ov.cpp;
        });
        g.accounts.forEach((a) => {
          if (a.credit_limit_cents == null) return;
          accounts[a.user_card_id] = {
            limitCents: a.credit_limit_cents,
            balanceCents: a.current_balance_cents ?? 0,
          };
        });
        prefs = g.prefs;
      }

      setData({
        wallet,
        offers,
        merchants: (mc.data ?? []) as MerchantCatalog[],
        programs,
        valuations,
        catalog,
        accounts,
        perCardOverrides,
        prefs,
      });
    })();
  }, [user, loading, reloadTick]);

  // Saved plans (signed-in only)
  useEffect(() => {
    if (!user) {
      setSavedPlans([]);
      return;
    }
    (async () => {
      const { data: rows } = await supabase
        .from("user_purchases")
        .select("id, merchant_text, amount_cents, category, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(6);
      setSavedPlans((rows ?? []) as SavedPlan[]);
    })();
  }, [user, reloadTick]);

  const merchantMatches = useMemo<MerchantCatalog[]>(() => {
    if (!merchantQuery.trim() || merchant) return [];
    const q = merchantQuery.toLowerCase().trim();
    // Local curated map first (fuzzy, typo-tolerant).
    const local = searchMerchants(merchantQuery, 6).map(
      (e): MerchantCatalog => ({
        id: e.id,
        name: e.name,
        category: e.category,
        aliases: e.aliases,
      }),
    );
    const seen = new Set(local.map((l) => l.name.toLowerCase()));
    // Database merchants as a supplement (e.g. user-visible offers merchants).
    const db = (data?.merchants ?? [])
      .filter(
        (m) =>
          !seen.has(m.name.toLowerCase()) &&
          (m.name.toLowerCase().includes(q) || m.aliases.some((a) => a.toLowerCase().includes(q))),
      )
      .slice(0, 6 - local.length);
    return [...local, ...db];
  }, [data, merchantQuery, merchant]);

  const merchantNote = useMemo(() => {
    if (!merchant) return null;
    const local = searchMerchants(merchant.name, 1)[0];
    return local?.note ?? null;
  }, [merchant]);

  const amountCents = useMemo(() => {
    const n = parseFloat(amountStr);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [amountStr]);

  // Persisted per-merchant category correction. Wins over the merchant's
  // default category so future decides use the user's mapping automatically.
  const correctionKey = merchant?.name || merchantQuery.trim();
  const [correctionTick, setCorrectionTick] = useState(0);
  const savedCategory = useMemo(
    () => (correctionKey ? getMerchantCategory(user?.id ?? null, correctionKey) : null),
    // correctionTick invalidates on save/clear
    [correctionKey, user?.id, correctionTick],
  );
  const effectiveCategory = savedCategory ?? merchant?.category ?? category;

  const handleCategoryPick = (c: string) => {
    setCategory(c);
    if (correctionKey) {
      setMerchantCategory(user?.id ?? null, correctionKey, c);
      setCorrectionTick((t) => t + 1);
    }
  };
  const handleClearCorrection = () => {
    if (!correctionKey) return;
    clearMerchantCategory(user?.id ?? null, correctionKey);
    setCorrectionTick((t) => t + 1);
  };

  // Full-catalog engine cards, used both for empty-wallet fallback and for
  // the wallet-vs-catalog upsell line. Excludes user-owned custom cards
  // (they're already in the wallet) and any card the user already holds.
  const ownedCatalogIds = useMemo(
    () => new Set((data?.wallet ?? []).map((c) => c.card_catalog_id)),
    [data?.wallet],
  );
  const catalogEngineCards: EngineCard[] = useMemo(() => {
    if (!data) return [];
    return Object.values(data.catalog)
      .filter(
        (c) => !(c as unknown as { is_custom?: boolean }).is_custom && !ownedCatalogIds.has(c.id),
      )
      .map((c) => ({
        id: `catalog_${c.id}`,
        card_catalog_id: c.id,
        nickname: null,
        issuer: c.issuer,
        name: c.name,
        points_program_id: c.points_program_id,
        foreign_tx_fee_pct: Number(c.foreign_tx_fee_pct),
        earn_rules: c.earn_rules ?? [],
      }));
  }, [data, ownedCatalogIds]);

  const walletEmpty = !!data && data.wallet.length === 0;

  // Build the "bonus cap reached" map for the current category across the
  // user's wallet. Only capped rules matching the effective category are
  // considered, so the map is tiny.
  const [capTick, setCapTick] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setCapTick((t) => t + 1);
    window.addEventListener("tap:capReached", handler);
    return () => window.removeEventListener("tap:capReached", handler);
  }, []);
  const capReachedByCard = useMemo(() => {
    if (!data) return {};
    const entries: Array<{ userCardId: string; category: string; period: CapPeriod }> = [];
    for (const c of data.wallet) {
      for (const r of c.earn_rules ?? []) {
        const cap = r.cap_period_spend ?? r.cap_annual_spend ?? null;
        if (cap == null) continue;
        if (r.category !== effectiveCategory) continue;
        entries.push({
          userCardId: c.id,
          category: r.category,
          period: (r.cap_period ?? "annual") as CapPeriod,
        });
      }
    }
    return capReachedByCardMap(user?.id ?? null, entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, effectiveCategory, user?.id, capTick]);

  const engineInputBase = useMemo(
    () => ({
      amountCents,
      category: effectiveCategory,
      merchant: merchant?.name ?? null,
      foreign,
      valuations: data?.valuations ?? {},
      capReachedCategoriesByCard: capReachedByCard,
    }),
    [amountCents, effectiveCategory, merchant, foreign, data?.valuations, capReachedByCard],
  );

  const result: EngineOutput | null = useMemo(() => {
    if (!data) return null;
    // Empty wallet → fall back to full catalog so the user still sees a play.
    const wallet = walletEmpty ? catalogEngineCards : data.wallet;
    return recommend({
      ...engineInputBase,
      wallet,
      offers: walletEmpty ? [] : data.offers,
    });
  }, [data, walletEmpty, catalogEngineCards, engineInputBase]);

  // Safety net: if the primary pass ever returns no winner despite a
  // populated wallet, run a second pass against the full catalog so the
  // decision path NEVER dead-ends. Invariant enforced here (and locked
  // by regression tests): with amount > 0 and either the user's wallet
  // or the catalog non-empty, `winner` below is non-null.
  const catalogFallback: EngineOutput | null = useMemo(() => {
    if (!data || walletEmpty) return null;
    if (result?.winner) return null;
    if (catalogEngineCards.length === 0) return null;
    return recommend({ ...engineInputBase, wallet: catalogEngineCards, offers: [] });
  }, [data, walletEmpty, result, catalogEngineCards, engineInputBase]);

  const upsell: WalletUpsell | null = useMemo(() => {
    if (!result || walletEmpty || catalogEngineCards.length === 0) return null;
    return computeWalletUpsell(result, { ...engineInputBase, offers: [] }, catalogEngineCards);
  }, [result, walletEmpty, catalogEngineCards, engineInputBase]);

  const utilization: UtilizationOutput | null = useMemo(() => {
    if (!result || !data?.prefs.utilization_enabled) return null;
    return applyUtilization({
      engineOutput: result,
      accountsByUserCardId: data.accounts,
      threshold: data.prefs.utilization_threshold_pct / 100,
      behavior: data.prefs.utilization_behavior,
      perCardOverrides: data.perCardOverrides,
    });
  }, [result, data]);

  if (loading) return <div className="min-h-screen bg-background" />;

  const canPlan = amountCents > 0;
  const rerankApplied = utilization?.behaviorApplied === "reranked";
  const primaryWinner = rerankApplied ? utilization!.winner : (result?.winner ?? null);
  const winner = primaryWinner ?? catalogFallback?.winner ?? null;
  const usingCatalogFallback = !primaryWinner && !!catalogFallback?.winner;
  const runnerUp = rerankApplied ? utilization!.runnerUp : (result?.runnerUp ?? null);
  const deltaVsSingle = result ? deltaVsBestSingleCents(result) : 0;

  const savePlan = async () => {
    if (!user || !winner || !result) return;
    setSaving(true);
    const { error } = await supabase.from("user_purchases").insert({
      user_id: user.id,
      merchant_text: merchant?.name ?? "Manual entry",
      merchant_catalog_id: merchant?.id && !merchant.id.startsWith("local_") ? merchant.id : null,
      amount_cents: amountCents,
      category: effectiveCategory,
      description: null,
      recommendation_json: JSON.parse(JSON.stringify(result)),
      recommended_user_card_id: (() => {
        const id = winner.legs[0]?.userCardId ?? null;
        if (!id) return null;
        if (id.startsWith("guest_") || id.startsWith("catalog_")) return null;
        return id;
      })(),
    });
    setSaving(false);
    if (error) toast.error("Could not save plan");
    else {
      toast.success("Plan saved to your log");
      setReloadTick((t) => t + 1);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-12 pb-4 flex items-center justify-between max-w-md mx-auto w-full">
        <h1 className="text-base font-semibold text-foreground">Plan</h1>
        {!user && (
          <Link
            to="/login"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        )}
      </header>

      <main className="flex-1 px-6 pt-2 pb-8 max-w-md mx-auto w-full">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            What are you buying?
          </p>
          <h2 className="font-display text-3xl tracking-tight text-foreground leading-[1.05]">
            Tell me the amount and where.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            I'll give you the exact play — including whether to split the charge across two cards.
          </p>
          {!user && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Guest mode — your wallet lives in this browser. Sign in to keep it.
            </p>
          )}
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <div>
            <label className="cs-microlabel block text-[11px] text-muted-foreground mb-1.5">
              Purchase amount
            </label>
            <div className="relative">
              <span className="cs-money absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <input
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="400.00"
                className="cs-money w-full rounded-2xl border border-border bg-surface pl-8 pr-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Merchant
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  ref={merchantInputRef}
                  value={merchant ? merchant.name : merchantQuery}
                  onChange={(e) => {
                    setMerchant(null);
                    setMerchantQuery(e.target.value);
                  }}
                  placeholder="Hyatt, Whole Foods, United…"
                  className="w-full rounded-2xl border border-border bg-surface pl-11 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              <button
                type="button"
                onClick={handleNearMe}
                disabled={nearbyLoading}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-2xl border border-border bg-surface px-3.5 py-3.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label="Find nearby merchants"
              >
                {nearbyLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MapPin className="size-4" />
                )}
                <span>Near me</span>
              </button>
            </div>
            {nearbyCandidates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {nearbyCandidates.map((c, i) => (
                  <button
                    key={`${c.name}-${i}`}
                    type="button"
                    onClick={() => pickCandidate(c)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
                  >
                    <span className="truncate max-w-[10rem]">{c.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      · {c.distanceMeters}m
                    </span>
                  </button>
                ))}
              </div>
            )}
            {nearbyMessage && (
              <p className="mt-2 text-[11px] text-muted-foreground">{nearbyMessage}</p>
            )}
            {merchantMatches.length > 0 && (
              <ul className="mt-2 rounded-xl border border-border bg-surface overflow-hidden divide-y divide-border">
                {merchantMatches.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => {
                        setMerchant(m);
                        setMerchantQuery("");
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-accent transition-colors"
                    >
                      <span className="text-sm text-foreground">{m.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {m.category.replace(/_/g, " ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {merchant && (
              <div className="mt-2 flex items-start justify-between gap-2 text-xs">
                <p className="text-muted-foreground">
                  <span className="text-foreground font-medium">{merchant.name}</span>
                  {" → "}
                  <span className="capitalize">
                    {(savedCategory ?? merchant.category).replace(/_/g, " ")}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMerchant(null);
                    setMerchantQuery("");
                    setCategory(merchant.category);
                  }}
                  className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Change merchant
                </button>
              </div>
            )}
            {savedCategory && correctionKey && (
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  Your category for <span className="text-foreground">{correctionKey}</span>
                </span>
                <button
                  type="button"
                  onClick={handleClearCorrection}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Use default
                </button>
              </div>
            )}
            {merchant && merchantNote && (
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                {merchantNote}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              {merchant || correctionKey ? "Override category" : "Or category"}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => handleCategoryPick(c)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    effectiveCategory === c
                      ? "bg-foreground text-background border-foreground"
                      : "bg-surface text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {c.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <input
              type="checkbox"
              checked={foreign}
              onChange={(e) => setForeign(e.target.checked)}
              className="size-3.5 accent-foreground"
            />
            <Globe className="size-3.5" />
            Foreign transaction
          </label>
        </div>

        {/* Result */}
        {!canPlan ? (
          <div className="mt-10 text-center text-sm text-muted-foreground">
            Enter an amount to see the play.
          </div>
        ) : !winner ? (
          <div className="mt-10 rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-foreground">Add a card to plan this purchase.</p>
            <Link
              to="/cards"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2 hover:opacity-80 min-h-11 py-2"
            >
              Add cards →
            </Link>
          </div>
        ) : (
          <div
            className="mt-8"
            key={`${winner.headline}-${amountCents}-${effectiveCategory}-${walletEmpty || usingCatalogFallback ? "cat" : "own"}`}
          >
            {(walletEmpty || usingCatalogFallback) && (
              <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3">
                <p className="text-xs text-foreground">
                  {walletEmpty
                    ? "Showing the best card from the catalog — add it to your wallet to keep this play."
                    : "Best available option based on your wallet + catalog."}
                </p>
                <Link
                  to="/cards"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground underline underline-offset-2 hover:opacity-80"
                >
                  Build your wallet →
                </Link>
              </div>
            )}
            <div className="cs-result-in">
              <WinnerCard
                winner={winner}
                runnerUp={runnerUp}
                deltaVsSingleCents={deltaVsSingle}
                data={data!}
                walletEmpty={walletEmpty || usingCatalogFallback}
              />
            </div>

            {utilization && utilization.behaviorApplied !== "none" && (
              <UtilizationStrip util={utilization} />
            )}

            {upsell && (
              <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                A <span className="text-foreground font-medium">{upsell.cardName}</span> would have
                earned{" "}
                <span className="text-foreground font-semibold tabular-nums">
                  {dollars(upsell.deltaCents)}
                </span>{" "}
                more on this purchase.{" "}
                <Link to="/cards" className="underline underline-offset-2 hover:text-foreground">
                  Add to wallet
                </Link>
                .
              </p>
            )}

            {user && !walletEmpty && (
              <button
                onClick={savePlan}
                disabled={saving}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <Bookmark className="size-3.5" />
                <span className="font-medium">{saving ? "Saving…" : "Save this plan"}</span>
              </button>
            )}

            <button
              onClick={() => setShowMath((s) => !s)}
              aria-expanded={showMath}
              className="mt-3 w-full flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="font-medium">Show the math</span>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform ${showMath ? "rotate-180" : ""}`}
              />
            </button>

            {showMath && result && (
              <div className="mt-3 rounded-xl border border-border bg-surface overflow-hidden cs-result-in">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left px-3 py-2 font-medium">Play</th>
                      <th className="text-left px-3 py-2 font-medium">Earn</th>
                      <th className="text-left px-3 py-2 font-medium">Offer</th>
                      <th className="text-right px-3 py-2 font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.mathTable.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-b border-border last:border-0 ${i === 0 ? "bg-accent/40" : ""}`}
                      >
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex items-center gap-1.5">
                            {r.playKind === "split" && (
                              <span className="text-[9px] uppercase tracking-wider text-primary font-medium">
                                Split
                              </span>
                            )}
                            <span className="text-foreground font-medium truncate">{r.label}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            {r.assumption}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-top text-muted-foreground tabular-nums">
                          {dollars(r.baseEarnCents)}
                        </td>
                        <td className="px-3 py-2.5 align-top text-muted-foreground tabular-nums">
                          {r.offerValueCents ? dollars(r.offerValueCents) : "—"}
                        </td>
                        <td className="px-3 py-2.5 align-top text-right font-semibold text-foreground tabular-nums">
                          {dollars(r.totalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {user && savedPlans.length > 0 && (
          <section className="mt-12">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Recent plans
            </h3>
            <ul className="space-y-1.5">
              {savedPlans.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-border bg-surface px-4 py-2.5 flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{p.merchant_text}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.category?.replace(/_/g, " ") ?? "—"} ·{" "}
                      {new Date(p.occurred_at).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-foreground shrink-0 ml-3">
                    {dollars(p.amount_cents)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function hydrateCard(
  id: string,
  card_catalog_id: string,
  nickname: string | null | undefined,
  catalog: Record<string, CatalogRow>,
): EngineCard | null {
  const c = catalog[card_catalog_id];
  if (!c) return null;
  return {
    id,
    card_catalog_id,
    nickname: nickname ?? null,
    issuer: c.issuer,
    name: c.name,
    points_program_id: c.points_program_id,
    foreign_tx_fee_pct: Number(c.foreign_tx_fee_pct),
    earn_rules: c.earn_rules ?? [],
  };
}

function WinnerCard({
  winner,
  runnerUp,
  deltaVsSingleCents,
  data,
  walletEmpty,
}: {
  winner: NonNullable<EngineOutput["winner"]>;
  runnerUp: EngineOutput["runnerUp"];
  deltaVsSingleCents: number;
  data: Loaded;
  walletEmpty: boolean;
}) {
  const runnerDelta = runnerUp ? winner.totalValueCents - runnerUp.totalValueCents : 0;
  // When rendering a catalog fallback play, the winner's legs reference
  // synthetic catalog_* ids that aren't in data.wallet — look them up in the
  // full catalog by card_catalog_id instead.
  const lookup = (userCardId: string) => {
    const owned = data.wallet.find((w) => w.id === userCardId);
    if (owned) return owned;
    if (userCardId.startsWith("catalog_")) {
      const catId = userCardId.slice("catalog_".length);
      const c = data.catalog[catId];
      if (c) {
        return {
          id: userCardId,
          card_catalog_id: catId,
          nickname: null,
          issuer: c.issuer,
          name: c.name,
          points_program_id: c.points_program_id,
          foreign_tx_fee_pct: Number(c.foreign_tx_fee_pct),
          earn_rules: c.earn_rules ?? [],
        } as EngineCard;
      }
    }
    return null;
  };
  const programs = new Set(
    winner.legs.map((l) => lookup(l.userCardId)?.points_program_id).filter((x): x is string => !!x),
  );

  const cardFaces: CardFace[] = winner.legs.map((l) => {
    const c = lookup(l.userCardId);
    const prog = c?.points_program_id ? data.programs[c.points_program_id] : null;
    return {
      name: c?.nickname ?? c?.name ?? l.cardLabel,
      issuer: c?.issuer ?? "",
      program: prog?.name ?? null,
      amountCents: l.amountCents,
    };
  });

  void walletEmpty;

  return (
    <div>
      {/* Chip label */}
      <div className="flex items-center gap-2 mb-4">
        <span className="cs-gold-surface cs-microlabel inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold">
          <span className="size-1.5 rounded-full bg-[hsl(30_45%_15%)]" />
          The play
        </span>
        {winner.kind === "split" && (
          <span className="cs-microlabel text-muted-foreground border border-border-strong rounded-full px-2 py-0.5 text-[10px]">
            Split charge
          </span>
        )}
      </div>

      {/* Signature card component */}
      <CardPlay cards={cardFaces} variant={winner.kind === "split" ? "ink" : "gold"} />

      {/* Recommendation sentence — set in the display face, the visual hero */}
      <p className="mt-6 font-display text-2xl sm:text-[26px] text-foreground leading-[1.1] tracking-tight cs-emboss">
        {winner.headline}
      </p>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="cs-microlabel text-[10px] text-muted-foreground">Net value</p>
          <p className="cs-money text-4xl text-foreground leading-none cs-emboss whitespace-nowrap">
            {dollars(winner.totalValueCents)}
          </p>
        </div>
        {runnerUp && runnerDelta > 0 && (
          <div className="text-right">
            <p className="cs-microlabel text-[10px] text-muted-foreground">vs runner-up</p>
            <p className="cs-money text-lg text-foreground whitespace-nowrap">
              +{dollars(runnerDelta)}
            </p>
          </div>
        )}
      </div>

      {winner.kind === "split" && deltaVsSingleCents > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Split beats best single-card play by{" "}
          <span className="font-semibold text-foreground tabular-nums">
            +{dollars(deltaVsSingleCents)}
          </span>
          .
        </p>
      )}

      {programs.size > 0 && (
        <div className="mt-5 pt-4 border-t border-border space-y-1">
          {Array.from(programs).map((pid) => {
            const prog = data.programs[pid];
            if (!prog || prog.kind === "cashback") return null;
            const cpp = data.valuations[pid] ?? Number(prog.default_cpp);
            return <AssumptionNote key={pid} program={prog} cpp={cpp} />;
          })}
        </div>
      )}
    </div>
  );
}

function UtilizationStrip({ util }: { util: UtilizationOutput }) {
  const anyOver = util.notes.some((n) => n.overThreshold);
  const headline =
    util.behaviorApplied === "reranked"
      ? "Re-ranked to stay under your cap"
      : util.behaviorApplied === "split-suggested"
        ? "Consider splitting to stay under your cap"
        : anyOver
          ? "This play pushes a card over your cap"
          : "Within your cap";
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        Credit health
      </p>
      <p className="text-sm text-foreground">{headline}</p>
      <ul className="mt-2 space-y-1.5">
        {util.notes.map((n) => (
          <li key={n.userCardId} className="flex items-center justify-between text-xs">
            <span className="text-foreground truncate mr-2">{n.cardLabel}</span>
            <span
              className={`tabular-nums ${n.overThreshold ? "text-foreground font-semibold" : "text-muted-foreground"}`}
            >
              {!n.limitKnown
                ? "limit unknown"
                : `${Math.round((n.currentPct ?? 0) * 100)}% → ${Math.round((n.projectedPct ?? 0) * 100)}%`}
              {n.limitKnown && (
                <span className="text-muted-foreground">
                  {" "}
                  · cap {Math.round(n.effectiveThreshold * 100)}%
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {util.splitSuggestion && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-foreground">{util.splitSuggestion.headline}</p>
        </div>
      )}
    </div>
  );
}
