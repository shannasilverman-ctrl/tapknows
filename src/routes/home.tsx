import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bottom-nav";
import { TapAppShell } from "@/components/tap-primitives";
import { ContextualPushSheet } from "@/components/contextual-push-sheet";
import { FeedbackSheet } from "@/components/feedback-sheet";
import { isFeedbackDue } from "@/lib/feedback";
import { trackJourneyEvent } from "@/lib/journeyEvents";

import { SaveWalletCard } from "@/components/save-wallet-card";
import { SaveWalletSheet } from "@/components/save-wallet-sheet";
import { WalletStack, type StackCard } from "@/components/wallet-stack";
import { WalletCardBriefing } from "@/components/wallet-card-briefing";
import { AddCardSheet } from "@/components/add-card-sheet";
import { OfflinePill } from "@/components/offline-pill";
import { LinkedBankStatus } from "@/components/linked-bank-status";
import { WalletConnectEntry } from "@/components/wallet-connect-entry";

import { useServerFn } from "@tanstack/react-start";
import { syncPlaidTopMerchants, listPlaidItems } from "@/lib/plaid.functions";

import { searchMerchants, resolveMerchant, type MerchantEntry } from "@/lib/merchantMap";
import {
  FALLBACK_CATEGORIES,
  rememberMerchantCategory,
  recallMerchantCategory,
} from "@/lib/merchantCategoryMemo";
import {
  getGuestWallet,
  addGuestCard,
  removeGuestCard,
  updateGuestCardNickname,
} from "@/lib/guestWallet";
import { CATALOG_BY_ID, type CatalogCard } from "@/lib/cardCatalog";
import { recoveredThisMonthCents } from "@/lib/recovered";
import { computeQuickPicks, getDecideHistory, type QuickPick } from "@/lib/quickPicks";
import { computeWalletRoles, type WalletRole } from "@/lib/walletRoles";
import { POINT_VALUATIONS } from "@/lib/pointValuations";
import type { CardCatalog, PointsProgram, UserCard } from "@/lib/types";
import { browserGetPosition } from "@/lib/nearby";
import {
  benefitsForCard,
  walletUnusedCents,
  walletNextDeadline,
  walletTopAtStake,
  syncFromServer as syncBenefitsFromServer,
  detectExpiredBenefits,
  trackBenefitSurfaced,
} from "@/lib/benefitState";
import { BENEFITS_BY_CARD, currentPeriod } from "@/lib/benefits";
import { dollars } from "@/lib/format";
import {
  Search,
  ArrowRight,
  ArrowLeft,
  Bell,
  Wand2,
  Plus,
  Gift,
  Sparkles,
  Clock,
  Bookmark,
  MapPin,
  ChevronRight,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";

const SAVE_DISMISSED_KEY = "tap.saveWalletDismissed";

const ONLINE_STORES = [
  { merchant: "Amazon", label: "Amazon.com" },
  { merchant: "Walmart", label: "Walmart.com" },
  { merchant: "Target", label: "Target.com" },
  { merchant: "Best Buy", label: "BestBuy.com" },
  { merchant: "Chewy", label: "Chewy" },
  { merchant: "eBay", label: "eBay" },
  { merchant: "Etsy", label: "Etsy" },
] as const;

const homeSearch = z.object({
  firstRun: z.coerce.number().optional(),
  pushAsk: z.coerce.number().optional(),
});

export const Route = createFileRoute("/home")({
  validateSearch: (s) => homeSearch.parse(s),
  component: HomePage,
});

type WalletCard = {
  id: string;
  catalog_id: string;
  issuer: string;
  name: string;
  nickname?: string | null;
  earnLine?: string;
  annualFee?: number;
};

type AlertRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  deep_link: string | null;
  severity: string;
};

function summarizeEarnRules(catalogId: string): string {
  const cat = CATALOG_BY_ID[catalogId];
  if (!cat || !cat.earn_rules?.length) return "Flat earn on everything.";
  const top = [...cat.earn_rules]
    .sort((a, b) => b.multiplier - a.multiplier)
    .slice(0, 2)
    .map((r) => {
      const label = r.category.replace(/_/g, " ");
      const rate = r.multiplier >= 1 ? `${r.multiplier}x` : `${Math.round(r.multiplier * 100)}%`;
      return `${rate} ${label}`;
    })
    .join(" · ");
  return top;
}

function toWalletCard(id: string, catalogId: string, nickname: string | null): WalletCard | null {
  const cat = CATALOG_BY_ID[catalogId];
  if (!cat) return null;
  return {
    id,
    catalog_id: cat.id,
    issuer: cat.issuer,
    name: cat.name,
    nickname,
    earnLine: summarizeEarnRules(cat.id),
    annualFee: cat.annual_fee,
  };
}

function iconForAlert(kind: string) {
  switch (kind) {
    case "offer_expiring":
      return <Gift className="size-4" />;
    case "sub_progress":
    case "sub_deadline":
      return <Sparkles className="size-4" />;
    case "cap_approaching":
      return <Clock className="size-4" />;
    default:
      return <Bell className="size-4" />;
  }
}

function labelForAlertKind(k: string): string {
  switch (k) {
    case "rotating_activate":
      return "Rotating 5%";
    case "offer_expiring":
      return "Offer";
    case "cap_approaching":
      return "Cap";
    case "sub_progress":
      return "Welcome bonus";
    case "sub_deadline":
      return "Deadline";
    default:
      return "Alert";
  }
}

function HomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { firstRun, pushAsk } = Route.useSearch();
  const [wallet, setWallet] = useState<WalletCard[]>([]);
  const [ready, setReady] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [query, setQuery] = useState("");
  const [onlineStoresOpen, setOnlineStoresOpen] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Read persisted recovered value on first render so the money line never
  // flashes "$0" then jumps to the real number.
  const [recovered, setRecovered] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      return recoveredThisMonthCents();
    } catch {
      return 0;
    }
  });
  const [hasLinkedItems, setHasLinkedItems] = useState<boolean | null>(null);
  const [benefitsTick, setBenefitsTick] = useState(0);
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [pushSheetOpen, setPushSheetOpen] = useState(false);
  const [saveDismissed, setSaveDismissed] = useState(true);
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const [firstDecideDone, setFirstDecideDone] = useState(false);
  const [plaidTop, setPlaidTop] = useState<{ name: string; count: number }[]>([]);
  const [nearbyIds, setNearbyIds] = useState<string[]>([]);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const [nearbyDenied, setNearbyDenied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const syncPlaid = useServerFn(syncPlaidTopMerchants);
  const listItems = useServerFn(listPlaidItems);

  // One-time voice-of-user prompt: fires once, after the 3rd lifetime decide.
  // The flag is set by bumpDecideCount() on the decide screen; we check on
  // every home mount and clear via markFeedbackShown() inside the sheet.
  useEffect(() => {
    if (isFeedbackDue()) {
      const t = window.setTimeout(() => setFeedbackOpen(true), 600);
      return () => window.clearTimeout(t);
    }
  }, []);

  // Save-moment gating: guest-only, after first decide, respects dismissal.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setFirstDecideDone(!!window.localStorage.getItem("tap.firstDecideDone"));
    setSaveDismissed(!!window.localStorage.getItem(SAVE_DISMISSED_KEY));
  }, [pushAsk, user]);

  const dismissSave = () => {
    try {
      window.localStorage.setItem(SAVE_DISMISSED_KEY, "1");
    } catch {}
    setSaveDismissed(true);
  };

  // First-run: land in merchant search state
  useEffect(() => {
    if (firstRun) {
      const t = window.setTimeout(() => searchRef.current?.focus(), 350);
      return () => window.clearTimeout(t);
    }
  }, [firstRun]);

  // Post-decide: contextual push ask
  useEffect(() => {
    if (pushAsk) {
      setPushSheetOpen(true);
      navigate({ to: "/home", search: {}, replace: true });
    }
  }, [pushAsk, navigate]);

  const refreshRecovered = () => setRecovered(recoveredThisMonthCents());

  useEffect(() => {
    refreshRecovered();
    const onEvt = () => refreshRecovered();
    const onBen = () => setBenefitsTick((t) => t + 1);
    window.addEventListener("tap:recovered", onEvt);
    window.addEventListener("tap:benefits", onBen);
    window.addEventListener("focus", onEvt);
    window.addEventListener("focus", onBen);
    return () => {
      window.removeEventListener("tap:recovered", onEvt);
      window.removeEventListener("tap:benefits", onBen);
      window.removeEventListener("focus", onEvt);
      window.removeEventListener("focus", onBen);
    };
  }, []);

  const loadWallet = async () => {
    if (user) {
      const { data } = await supabase
        .from("user_cards")
        .select("id, card_catalog_id, nickname")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      const cards: WalletCard[] = (data ?? [])
        .map((r) => toWalletCard(r.id, r.card_catalog_id, r.nickname ?? null))
        .filter(Boolean) as WalletCard[];
      const { data: alertRows } = await supabase
        .from("alerts")
        .select("id, kind, title, body, deep_link, severity")
        .eq("user_id", user.id)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(3);
      setWallet(cards);
      setAlerts((alertRows ?? []) as AlertRow[]);
    } else {
      const g = getGuestWallet();
      const cards: WalletCard[] = g.cards
        .map((c) => toWalletCard(c.id, c.card_catalog_id, c.nickname ?? null))
        .filter(Boolean) as WalletCard[];
      setWallet(cards);
      setAlerts([]);
    }
    setReady(true);
  };

  useEffect(() => {
    if (loading) return;
    loadWallet();
  }, [user, loading]);

  // Session nearby-denied flag
  useEffect(() => {
    if (typeof window === "undefined") return;
    setNearbyDenied(!!window.sessionStorage.getItem("tap.nearbyDenied"));
  }, []);

  // Reconcile server-side benefit redemptions into local storage once per sign-in.
  useEffect(() => {
    if (!user?.id) return;
    void syncBenefitsFromServer(user.id).then(() => setBenefitsTick((t) => t + 1));
  }, [user?.id]);

  // Fire benefit_expired when a period rolls over with unredeemed value.
  useEffect(() => {
    if (!ready) return;
    const ids = Array.from(new Set(wallet.map((c) => c.catalog_id)));
    if (ids.length) detectExpiredBenefits(user?.id ?? null, ids);
  }, [ready, wallet, user?.id]);

  // Plaid: cached top merchants + at-most-once-per-day sync when signed in.
  // Also tracks whether the user has any linked institutions so the wallet
  // hierarchy can drop the standalone connect entry when a bank is linked.
  useEffect(() => {
    if (!user) {
      setPlaidTop([]);
      setHasLinkedItems(false);
      return;
    }
    try {
      const raw = window.localStorage.getItem("tap.plaidTop");
      if (raw) setPlaidTop(JSON.parse(raw));
    } catch {}
    (async () => {
      try {
        const { items } = await listItems();
        setHasLinkedItems((items ?? []).length > 0);
        if (!items.length) return;
        const key = "tap.plaidLastSync";
        const last = Number(window.localStorage.getItem(key) ?? 0);
        const day = 24 * 3600 * 1000;
        if (Date.now() - last < day) return;
        const { merchants } = await syncPlaid();
        setPlaidTop(merchants);
        window.localStorage.setItem("tap.plaidTop", JSON.stringify(merchants));
        window.localStorage.setItem(key, String(Date.now()));
      } catch (e) {
        setHasLinkedItems(false);
        console.error("[home] plaid sync", e);
      }
    })();
  }, [user, listItems, syncPlaid]);

  const requestNearMe = async () => {
    setNearbyBusy(true);
    try {
      const coords = await browserGetPosition();
      // Rank known merchants by proximity via the existing nearby server fn.
      const { fetchNearbyMerchantsFn } = await import("@/lib/nearby.functions");
      const { candidates } = await fetchNearbyMerchantsFn({ data: coords });
      const ids: string[] = [];
      for (const c of candidates) {
        const m = resolveMerchant(c.name);
        if (m && !ids.includes(m.id)) ids.push(m.id);
      }
      if (ids.length === 0) {
        toast.message("Nothing familiar nearby.");
      }
      setNearbyIds(ids);
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 1) {
        window.sessionStorage.setItem("tap.nearbyDenied", "1");
        setNearbyDenied(true);
      } else {
        toast.error("Couldn't get your location.");
      }
    } finally {
      setNearbyBusy(false);
    }
  };

  const results = useMemo(() => (query.trim() ? searchMerchants(query, 6) : []), [query]);

  const walletKey = useMemo(() => wallet.map((c) => c.catalog_id).join(","), [wallet]);
  const plaidKey = useMemo(() => plaidTop.map((p) => p.name).join("|"), [plaidTop]);
  const nearbyKey = useMemo(() => nearbyIds.join("|"), [nearbyIds]);
  const quickPicks: QuickPick[] = useMemo(() => {
    if (!ready) return [];
    return computeQuickPicks({
      now: new Date(),
      history: getDecideHistory(),
      walletCatalogIds: wallet.map((c) => c.catalog_id),
      plaidTopMerchants: plaidTop,
      nearbyMerchantIds: nearbyIds,
      userId: user?.id ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, walletKey, plaidKey, nearbyKey, user?.id, benefitsTick]);

  // Wallet roles — self-describing view of what each card is FOR. Uses the
  // same planner the engine uses so we can't drift from decide's math.
  // Only surfaces at 2+ cards; a single-card wallet is just "your everyday card".
  const walletRoles: WalletRole[] = useMemo(() => {
    if (!ready || wallet.length < 2) return [];
    const catalog: Record<string, CardCatalog> = {};
    const programs: Record<string, PointsProgram> = {};
    const userCards: UserCard[] = [];
    for (const w of wallet) {
      const c = CATALOG_BY_ID[w.catalog_id];
      if (!c) continue;
      catalog[c.id] = {
        id: c.id,
        issuer: c.issuer,
        name: c.name,
        annual_fee: c.annual_fee,
        points_program_id: c.points_program_id,
        foreign_tx_fee_pct: c.foreign_tx_fee_pct,
        earn_rules: c.earn_rules,
        notes: c.notes ?? null,
      };
      const pid = c.points_program_id;
      if (pid && !programs[pid]) {
        const v = POINT_VALUATIONS[pid];
        programs[pid] = {
          id: pid,
          name: v?.displayName ?? pid,
          kind: pid === "cashback" ? "cashback" : "transferable",
          default_cpp: v?.cpp ?? 0.01,
        };
      }
      userCards.push({
        id: w.id,
        user_id: user?.id ?? "guest",
        card_catalog_id: w.catalog_id,
        nickname: w.nickname ?? null,
        opened_at: null,
        annual_fee_paid_at: null,
        created_at: "",
      });
    }
    return computeWalletRoles({ userCards, catalog, programs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, walletKey, user?.id]);

  // Online-dominant detection — >= 3 of the last 20 decides landed on an
  // online-shopping merchant. Promotes the online fast path to a full row
  // above the search bar rather than sitting inside the quick pick strip.
  const onlineDominant = useMemo(() => {
    if (!ready) return false;
    const history = getDecideHistory().slice(0, 20);
    if (history.length < 3) return false;
    const onlineMerchants = new Set([
      "local_amazon",
      "local_chewy",
      "local_ebay",
      "local_etsy",
      "local_wayfair",
      "local_newegg",
    ]);
    const onlineCats = new Set(["amazon", "everything_else"]);
    const hits = history.filter(
      (e) => onlineMerchants.has(e.merchantId) || onlineCats.has(e.category),
    ).length;
    return hits >= 3;
  }, [ready]);

  // Unused benefits across the wallet — one honest line beneath Recovered.
  const benefitsSummary = useMemo(() => {
    if (!ready)
      return { unusedCents: 0, deadline: null as Date | null, topCatalogId: null as string | null };
    const ids = Array.from(new Set(wallet.map((c) => c.catalog_id)));
    const uid = user?.id ?? null;
    const now = new Date();
    const top = walletTopAtStake(uid, ids, now);
    return {
      unusedCents: walletUnusedCents(uid, ids, now),
      deadline: walletNextDeadline(uid, ids, now),
      topCatalogId: top?.card_catalog_id ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, walletKey, user?.id, benefitsTick]);

  // Synthetic alerts: one per redeemable benefit ending within 10 days with value left.
  const benefitAlerts: AlertRow[] = useMemo(() => {
    if (!ready) return [];
    const out: AlertRow[] = [];
    const uid = user?.id ?? null;
    const now = new Date();
    const seen = new Set<string>();
    for (const c of wallet) {
      if (seen.has(c.catalog_id)) continue;
      seen.add(c.catalog_id);
      const list = BENEFITS_BY_CARD[c.catalog_id] ?? [];
      const state = benefitsForCard(uid, c.catalog_id);
      for (const b of list) {
        if (b.kind !== "redeemable" || b.value_cents == null) continue;
        const remaining = state.find((s) => s.benefit.id === b.id)?.remaining_cents ?? 0;
        if (remaining <= 0) continue;
        const { endsAt } = currentPeriod(b.cadence, now);
        const days = Math.round((endsAt.getTime() - now.getTime()) / 86_400_000);
        if (days < 0 || days > 10) continue;
        const firstMerchant = b.merchants?.[0];
        out.push({
          id: `benefit:${c.catalog_id}:${b.id}`,
          kind: "benefit_expiring",
          title: `${dollars(remaining)} of your ${b.label} unused`,
          body: `Resets ${endsAt.toLocaleDateString([], { month: "short", day: "numeric" })}.`,
          deep_link: firstMerchant
            ? `/decide?merchant=${encodeURIComponent(firstMerchant)}&fromStack=1`
            : "/home",
          severity: days <= 3 ? "warning" : "info",
        });
        trackBenefitSurfaced("alert", { id: b.id, card_catalog_id: b.card_catalog_id });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, walletKey, user?.id, benefitsTick]);

  const displayAlerts = useMemo(() => [...benefitAlerts, ...alerts], [benefitAlerts, alerts]);

  // Decision funnel: the customer arrived with a usable wallet. Emitted once
  // the wallet has actually loaded, so it measures readiness, not page views.
  useEffect(() => {
    if (!ready) return;
    trackJourneyEvent("wallet_ready", { cards: wallet.length });
  }, [ready, wallet.length]);

  const goDecide = (m: MerchantEntry, opp?: string) => {
    trackJourneyEvent("merchant_selected", { merchantId: m.id, source: "search" });
    navigate({
      to: "/decide",
      search: opp ? { merchant: m.id, fromStack: 1, opp } : { merchant: m.id, fromStack: 1 },
    });
  };

  const goDecideCustom = (name: string, categoryId: string) => {
    trackJourneyEvent("merchant_selected", { merchantName: name, category: categoryId });
    rememberMerchantCategory(name, categoryId);
    navigate({
      to: "/decide",
      search: {
        merchantName: name,
        category: categoryId,
        fromStack: 1,
        fromCategory: 1,
      },
    });
  };

  const trimmedQuery = query.trim();
  const remembered = useMemo(
    () => (trimmedQuery ? recallMerchantCategory(trimmedQuery) : null),
    [trimmedQuery],
  );
  const showFallback = trimmedQuery.length > 0 && results.length === 0;

  const openedCard = wallet.find((c) => c.id === openedId) ?? null;

  const stackCards: StackCard[] = useMemo(
    () =>
      wallet.map((c) => ({
        id: c.id,
        issuer: c.issuer,
        name: c.nickname || c.name,
      })),
    [wallet],
  );

  const existingCatalogIds = useMemo(() => new Set(wallet.map((c) => c.catalog_id)), [wallet]);

  const handleAdd = async (card: CatalogCard) => {
    if (user) {
      const { data, error } = await supabase
        .from("user_cards")
        .insert({ user_id: user.id, card_catalog_id: card.id })
        .select("id")
        .single();
      if (error) throw error;
      const id = data?.id as string | undefined;
      await loadWallet();
      if (id) {
        setNewlyAddedId(id);
        window.setTimeout(() => setNewlyAddedId(null), 700);
      }
    } else {
      const created = addGuestCard(card.id);
      await loadWallet();
      setNewlyAddedId(created.id);
      window.setTimeout(() => setNewlyAddedId(null), 700);
    }
  };

  const handleRemove = async (id: string) => {
    if (user) {
      await supabase.from("user_cards").delete().eq("id", id);
    } else {
      removeGuestCard(id);
    }
    setOpenedId(null);
    await loadWallet();
    toast.success("Card removed");
  };

  const handleRename = async (id: string, nickname: string) => {
    if (user) {
      await supabase
        .from("user_cards")
        .update({ nickname: nickname || null })
        .eq("id", id);
    } else {
      updateGuestCardNickname(id, nickname || null);
    }
    await loadWallet();
  };

  // Detail view (pinned card) takes over the screen
  if (openedCard) {
    return (
      <WalletCardBriefing
        card={{
          id: openedCard.id,
          catalogId: openedCard.catalog_id,
          issuer: openedCard.issuer,
          name: openedCard.name,
          nickname: openedCard.nickname,
        }}
        userId={user?.id ?? null}
        onBack={() => setOpenedId(null)}
        onRemove={() => handleRemove(openedCard.id)}
        onRename={(nickname) => handleRename(openedCard.id, nickname)}
      />
    );
  }

  return (
    <TapAppShell className="tap-app-shell">
      <header className="cs-safe-top tap-home-header px-5 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="tap-mini-logo text-[18px]">
            TAP
            <i />
          </span>
          <OfflinePill />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={`inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground h-11 w-11 hover:opacity-90 transition-opacity ${
              ready && wallet.length === 0 && hasLinkedItems === false ? "cs-plus-pulse" : ""
            }`}
            aria-label="Add card"
          >
            <Plus className="size-5" strokeWidth={2.25} />
          </button>
          {user ? (
            <Link
              to="/alerts"
              className="relative inline-flex items-center justify-center h-11 w-11 rounded-full hover:bg-secondary transition-colors"
              aria-label="Alerts"
            >
              <Bell className="size-5 text-foreground" strokeWidth={1.75} />
              {displayAlerts.length > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-[10px] font-semibold text-primary-foreground flex items-center justify-center leading-none">
                  {displayAlerts.length > 9 ? "9+" : displayAlerts.length}
                </span>
              )}
            </Link>
          ) : null}
          {!user && firstDecideDone && saveDismissed && (
            <button
              type="button"
              onClick={() => setSaveSheetOpen(true)}
              className="inline-flex items-center gap-1.5 h-11 pl-2.5 pr-3 rounded-full border border-border bg-white hover:border-primary/40 transition-colors text-[13px] font-medium text-foreground"
              aria-label="Save wallet"
            >
              <Bookmark className="size-3.5 text-primary" />
              Save
            </button>
          )}
        </div>
      </header>

      <main
        className="flex-1 px-5 pb-10 max-w-md w-full mx-auto cs-stack-scroll"
        data-wallet-ready={ready ? "true" : "false"}
      >
        {/* The product starts with the customer's question, not their data. */}
        <section className="tap-home-core tap-motion-scene">
          <div className="mt-6 tap-app-question tap-stage tap-stage-question">
            <p className="cs-microlabel text-[10px] text-primary mb-2">Ask TAP</p>
            <h1 className="cs-title-lg text-foreground">Where are you paying?</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Name the place. TAP will name the card.
            </p>
            <div className="tap-home-flow" aria-label="How TAP works">
              <span>
                <b>1</b> Place
              </span>
              <i aria-hidden />
              <span>
                <b>2</b> Card
              </span>
              <i aria-hidden />
              <span>
                <b>3</b> Value
              </span>
            </div>
          </div>

          {/* Online-dominant lead — when decide history shows online as this
            user's power case, we lead with a one-tap answer above search. */}
          {ready && wallet.length > 0 && onlineDominant && (
            <button
              onClick={() => {
                setOnlineStoresOpen(true);
              }}
              className="mt-4 w-full flex items-center justify-between rounded-2xl border border-primary/40 bg-white px-4 py-3 hover:border-primary/70 transition-colors text-left shadow-[0_2px_10px_-6px_rgba(15,23,42,0.15)] min-h-11"
              aria-label="Show common online stores"
              aria-expanded={onlineStoresOpen}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                  <ShoppingBag className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-foreground">Online shopping</p>
                  <p className="text-[12px] text-muted-foreground">
                    Choose the store or keep searching.
                  </p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground shrink-0" />
            </button>
          )}

          {/* Search sits above the stack */}
          <div className="mt-4 tap-stage tap-stage-search">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    onlineStoresOpen
                      ? "Search Amazon, Target, any online store…"
                      : "Try Whole Foods, Delta, Amazon…"
                  }
                  autoComplete="off"
                  className="w-full h-12 rounded-2xl bg-white border border-border pl-11 pr-4 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 shadow-[0_2px_10px_-6px_rgba(15,23,42,0.15)]"
                />
              </div>
              {!nearbyDenied && nearbyIds.length === 0 && (
                <button
                  type="button"
                  onClick={requestNearMe}
                  disabled={nearbyBusy}
                  title="Use your location to surface nearby merchants"
                  className="shrink-0 inline-flex items-center gap-1.5 h-12 px-3 rounded-2xl border border-border bg-white text-[13px] font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
                  aria-label="Show merchants near me"
                >
                  <MapPin className="size-4 text-primary" />
                  {nearbyBusy ? "…" : "Near me"}
                </button>
              )}
            </div>

            {results.length > 0 && (
              <div className="mt-2 rounded-2xl border border-border bg-white overflow-hidden divide-y divide-border shadow-[0_6px_18px_-8px_rgba(15,23,42,0.15)]">
                {results.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => goDecide(m)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/60 transition-colors text-left min-h-11"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-foreground truncate">{m.name}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {m.category.replace(/_/g, " ")}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {showFallback &&
              (remembered ? (
                <div className="mt-2 rounded-2xl border border-border bg-white overflow-hidden shadow-[0_6px_18px_-8px_rgba(15,23,42,0.15)]">
                  <button
                    onClick={() => goDecideCustom(trimmedQuery, remembered)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/60 transition-colors text-left min-h-11"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-foreground truncate">
                        {trimmedQuery}
                      </p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {remembered.replace(/_/g, " ")} · saved
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                  </button>
                </div>
              ) : (
                <div className="mt-2 rounded-2xl border border-border bg-white p-4 shadow-[0_6px_18px_-8px_rgba(15,23,42,0.15)]">
                  <p className="text-[15px] font-medium text-foreground">New spot.</p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">What kind of purchase?</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {FALLBACK_CATEGORIES.map((c) => (
                      <button
                        key={c.label}
                        onClick={() => goDecideCustom(trimmedQuery, c.id)}
                        className="min-h-11 rounded-xl border border-border bg-white hover:border-primary/40 hover:bg-secondary/40 transition-colors px-3 py-3 text-[14px] font-medium text-foreground text-left"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

            {!query.trim() && wallet.length > 0 && (
              <div
                className="tap-merchant-bubbles mt-3 -mx-1 flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1"
                data-mode={onlineStoresOpen ? "online" : "default"}
                aria-label={onlineStoresOpen ? "Common online stores" : "Suggested places"}
              >
                {onlineStoresOpen ? (
                  <>
                    <button
                      onClick={() => setOnlineStoresOpen(false)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 hover:border-primary/40 transition-colors px-3.5 py-1.5 text-[13px] font-medium text-foreground min-h-11 whitespace-nowrap"
                    >
                      <ArrowLeft className="size-3.5" aria-hidden />
                      All places
                    </button>
                    {ONLINE_STORES.map((store) => {
                      const merchant = resolveMerchant(store.merchant);
                      if (!merchant) return null;
                      return (
                        <button
                          key={store.merchant}
                          onClick={() => goDecide(merchant)}
                          className="tap-online-store-bubble shrink-0 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-white hover:border-primary/70 transition-colors px-3.5 py-1.5 text-[13px] font-medium text-foreground min-h-11 whitespace-nowrap"
                        >
                          {store.label}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {/* Online shopping opens a focused merchant set while the
                        search field and the rest of the decision surface persist. */}
                    {nearbyIds.length === 0 && !onlineDominant && (
                      <button
                        onClick={() => {
                          setOnlineStoresOpen(true);
                        }}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-white hover:border-primary/70 transition-colors px-3.5 py-1.5 text-[13px] font-medium text-foreground min-h-11 whitespace-nowrap"
                        aria-label="Show common online stores"
                        aria-expanded="false"
                      >
                        <ShoppingBag className="size-3.5 text-primary" aria-hidden />
                        Online shopping
                      </button>
                    )}
                    {quickPicks.map((p) => (
                      <button
                        key={p.merchant.id}
                        onClick={() => goDecide(p.merchant, p.opportunity)}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border bg-white transition-colors px-3.5 py-1.5 text-[13px] font-medium text-foreground min-h-11 whitespace-nowrap ${
                          p.opportunity
                            ? "border-primary/40 hover:border-primary/70"
                            : "border-border hover:border-primary/40"
                        }`}
                        aria-label={
                          p.opportunity ? `${p.merchant.name} — opportunity` : p.merchant.name
                        }
                      >
                        {p.nearby && <MapPin className="size-3 text-primary" aria-hidden />}
                        {p.opportunity && !p.nearby && (
                          <span
                            className="inline-block size-1.5 rounded-full bg-primary"
                            aria-hidden
                          />
                        )}
                        {p.merchant.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* The wallet supports the answer; it is no longer the opening task. */}
          <div className={`mt-6 ${newlyAddedId ? "cs-card-drop-in" : ""}`}>
            {!ready ? (
              // The first paint already tells the product story. This keeps
              // the wallet's real silhouette in place while local state loads.
              <div className="tap-home-loading-state" aria-hidden>
                <div className="tap-loading-recent">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="tap-sample-wallet tap-loading-wallet">
                  <span className="tap-sample-card tap-sample-card-one" />
                  <span className="tap-sample-card tap-sample-card-two" />
                  <span className="tap-sample-card tap-sample-card-three" />
                  <span className="tap-wallet-pocket" />
                </div>
              </div>
            ) : wallet.length === 0 ? (
              <div className="text-center tap-demo-wallet-state">
                <div
                  className="tap-recent-merchants tap-stage tap-stage-recent text-left"
                  aria-label="Recent merchants"
                >
                  <p>Recent</p>
                  <Link to="/demo" className="tap-recent-row">
                    <span className="tap-merchant-mark">◌</span>
                    <span>Whole Foods</span>
                    <span>›</span>
                  </Link>
                  <Link to="/demo" className="tap-recent-row">
                    <span className="tap-merchant-mark">◎</span>
                    <span>Target</span>
                    <span>›</span>
                  </Link>
                  <Link to="/demo" className="tap-recent-row">
                    <span className="tap-merchant-mark">▱</span>
                    <span>Starbucks</span>
                    <span>›</span>
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="tap-empty-wallet tap-sample-wallet tap-stage tap-stage-wallet block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label="Add your first card"
                >
                  <span className="tap-sample-card tap-sample-card-one" />
                  <span className="tap-sample-card tap-sample-card-two" />
                  <span className="tap-sample-card tap-sample-card-three" />
                  <span className="tap-wallet-pocket" />
                  <span className="tap-empty-title">Your wallet · add cards</span>
                </button>
                <Link to="/demo" className="tap-demo-wallet-cta tap-stage tap-stage-cta">
                  Try Whole Foods with a demo wallet <ArrowRight className="size-4" />
                </Link>
                {/* Single connect entry in the empty state — the main-flow
                  entry is suppressed when wallet is empty so this is the
                  only connect affordance the user sees. */}
                <div className="mt-4 text-left">
                  <WalletConnectEntry
                    isGuest={!user}
                    forceCompactPair
                    onManual={() => setAddOpen(true)}
                    onPlaidNeedAuth={() => setSaveSheetOpen(true)}
                    onPlaidComplete={() => loadWallet()}
                  />
                </div>
              </div>
            ) : (
              <div className="tap-stage tap-stage-wallet">
                <WalletStack
                  cards={stackCards}
                  onOpen={(id) => setOpenedId(id)}
                  pocket
                  pocketLabel={`Your wallet · ${wallet.length} ${wallet.length === 1 ? "card" : "cards"} · Tap for guide`}
                />
              </div>
            )}
          </div>
        </section>

        {/* Supporting account context follows the core decision moment so
            the customer's question is always the first action on the page. */}
        {ready && wallet.length > 0 && (
          <section className="tap-home-summary mt-8 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Recovered this month
              </p>
              <p className="cs-money text-[22px] font-semibold text-foreground tabular-nums mt-0.5">
                {dollars(recovered)}
              </p>
              {recovered === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                  Money TAP has caught for you this month.
                </p>
              )}
            </div>
            {benefitsSummary.unusedCents > 0 ? (
              <button
                type="button"
                onClick={() => {
                  const target = benefitsSummary.topCatalogId;
                  if (!target) return;
                  const card = wallet.find((c) => c.catalog_id === target);
                  if (card) setOpenedId(card.id);
                }}
                className="shrink-0 inline-flex items-center gap-1.5 min-h-11 rounded-full border border-border bg-white pl-3 pr-2.5 text-[12px] text-muted-foreground hover:border-primary/40 transition-colors text-left"
                aria-label="View card credits you haven't used"
              >
                <span className="tabular-nums text-foreground font-medium">
                  {dollars(benefitsSummary.unusedCents)}
                </span>
                <span>in card credits you haven't used</span>
                <ArrowRight className="size-3 text-muted-foreground shrink-0" aria-hidden />
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground shrink-0">
                {wallet.length} {wallet.length === 1 ? "card" : "cards"}
              </p>
            )}
          </section>
        )}

        {user && (
          <div className="mt-3 -mx-1">
            <LinkedBankStatus />
          </div>
        )}

        {hasLinkedItems === false && wallet.length > 0 && (
          <div className="mt-3">
            <WalletConnectEntry
              isGuest={!user}
              singleQuiet
              onManual={() => setAddOpen(true)}
              onPlaidNeedAuth={() => setSaveSheetOpen(true)}
              onPlaidComplete={() => loadWallet()}
            />
          </div>
        )}

        {!user && firstDecideDone && !saveDismissed && !pushSheetOpen && (
          <div className="mt-5">
            <SaveWalletCard onSave={() => setSaveSheetOpen(true)} onDismiss={dismissSave} />
          </div>
        )}

        {/* Your wallet at a glance — role rows. Only when the wallet is
            large enough for roles to mean anything. Editorial: no badges,
            no icons per row; the labels do the work. */}
        {walletRoles.length > 1 && (
          <section className="mt-8">
            <p className="cs-microlabel text-[10px] mb-3">Your wallet</p>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-white overflow-hidden">
              {walletRoles.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => goDecideCustom(r.merchantLabel, r.category)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-11 hover:bg-secondary/40 active:scale-[0.98] transition-transform"
                    aria-label={`${r.label} — ${r.nickname ?? `${r.cardIssuer} ${r.cardName}`}`}
                  >
                    <div className="w-20 shrink-0">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {r.label}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-foreground truncate">
                        {r.nickname ?? `${r.cardIssuer} ${r.cardName}`}
                      </p>
                      <p className="text-[12px] text-muted-foreground truncate">{r.reasoning}</p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Alerts as passes */}
        {displayAlerts.length > 0 && (
          <section className="mt-8">
            <p className="cs-microlabel text-[10px] mb-3">Alerts</p>
            <ul className="space-y-3">
              {displayAlerts.map((a) => (
                <li key={a.id}>
                  <Link
                    to={(a.deep_link ?? "/alerts") as never}
                    className="cs-pass block hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        {iconForAlert(a.kind)}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {labelForAlertKind(a.kind)}
                      </span>
                      {a.severity === "urgent" && (
                        <span className="ml-auto text-[10px] uppercase tracking-[0.14em] font-semibold text-destructive">
                          Urgent
                        </span>
                      )}
                    </div>
                    <div className="cs-pass-divider" aria-hidden />
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[15px] font-medium text-foreground leading-snug">
                        {a.title}
                      </p>
                    </div>
                    {a.body && (
                      <p className="mt-1 text-[12px] text-muted-foreground leading-snug">
                        {a.body}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {user && (
              <Link
                to="/alerts"
                className="mt-3 block text-center text-[13px] text-primary font-medium hover:opacity-80 transition-opacity"
              >
                See all alerts
              </Link>
            )}
          </section>
        )}

        {/* Demo entry */}
        <Link
          to="/demo"
          className="mt-6 flex items-center justify-between rounded-2xl bg-white border border-border px-4 py-4 hover:border-primary/40 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-secondary text-foreground">
              <Wand2 className="size-4" />
            </span>
            <div>
              <p className="text-[15px] font-medium text-foreground">See the answer in action</p>
              <p className="text-[12px] text-muted-foreground">A 30-second TAP</p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>

        <div className="mt-6 text-center">
          <Link
            to="/plan"
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            Advanced planner
          </Link>
        </div>
      </main>

      <BottomNav />

      <AddCardSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onConfirm={handleAdd}
        existingCatalogIds={existingCatalogIds}
        onPlaidNeedAuth={() => setSaveSheetOpen(true)}
        onPlaidComplete={() => loadWallet()}
      />

      <ContextualPushSheet open={pushSheetOpen} onClose={() => setPushSheetOpen(false)} />

      <SaveWalletSheet open={saveSheetOpen} onClose={() => setSaveSheetOpen(false)} />

      <FeedbackSheet open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </TapAppShell>
  );
}
