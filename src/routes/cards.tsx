import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { CardCatalog, EarnRule, PointsProgram, UserCard, UserOffer } from "@/lib/types";
import { dollars } from "@/lib/format";
import { BottomNav } from "@/components/bottom-nav";
import { TapAppShell } from "@/components/tap-primitives";
import {
  addGuestCard,
  getGuestWallet,
  removeGuestCard,
  updateGuestCardNickname,
} from "@/lib/guestWallet";
import { ArrowLeft, ArrowRight, BookOpen, CreditCard, Plus, Search, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { toast } from "sonner";
import { CARD_CATALOG, CATALOG_BY_ID } from "@/lib/cardCatalog";
import { POINT_VALUATIONS } from "@/lib/pointValuations";
import { computeWalletGuide, type WalletRole } from "@/lib/walletRoles";
import { WalletCardBriefing } from "@/components/wallet-card-briefing";
import { capReachedByCardMap, type CapPeriod } from "@/lib/capReached";
import type { AccountSnapshot, UtilizationBehavior } from "@/lib/utilizationFilter";

const cardsSearch = z.object({
  card: z.string().optional(),
  source: z.string().optional(),
});

export const Route = createFileRoute("/cards")({
  validateSearch: (search) => cardsSearch.parse(search),
  component: CardsPage,
});

type Data = {
  userCards: UserCard[];
  catalog: Record<string, CardCatalog & { is_custom?: boolean }>;
  catalogList: (CardCatalog & { is_custom?: boolean })[];
  programs: PointsProgram[];
  offers: UserOffer[];
  cppOverrides: Record<string, number>;
  accountsByUserCardId: Record<string, AccountSnapshot>;
  perCardUtilization: Record<string, number>;
  utilizationPrefs: {
    enabled: boolean;
    threshold: number;
    behavior: UtilizationBehavior;
  };
  isGuest: boolean;
};

function friendlyDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}

function catalogRateLabel(multiplier: number): string {
  return multiplier < 1 ? `${Math.round(multiplier * 100)}%` : `${multiplier}x`;
}

function CardsPage() {
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<"list" | "choose" | "catalog" | "manual">("list");
  const [capRevision, setCapRevision] = useState(0);

  const load = async () => {
    // Guest checkout decisions are entirely device-local. Do not hold their
    // wallet behind a catalog network request: the verified catalog ships
    // with the app and is enough to render every guest card immediately.
    const [cc, pp] = user
      ? await Promise.all([
          supabase.from("cards_catalog").select("*").order("issuer").order("name"),
          supabase.from("points_programs").select("*").order("name"),
        ])
      : ([{ data: null }, { data: null }] as const);
    const catalog: Record<string, CardCatalog & { is_custom?: boolean }> = {};
    const remoteCatalog = (cc.data ?? []) as unknown as (CardCatalog & {
      is_custom?: boolean;
    })[];
    const remoteById = new Map(remoteCatalog.map((card) => [card.id, card]));
    const canonicalIds = new Set(CARD_CATALOG.map((card) => card.id));
    const verifiedCatalog = CARD_CATALOG.map((verified) => {
      const remote = remoteById.get(verified.id);
      return {
        ...remote,
        id: verified.id,
        issuer: verified.issuer,
        name: verified.name,
        annual_fee: verified.annual_fee,
        points_program_id: verified.points_program_id,
        foreign_tx_fee_pct: verified.foreign_tx_fee_pct,
        earn_rules: verified.earn_rules,
        notes: verified.notes ?? null,
        rates_verified_on: verified.rates_verified_on,
      };
    });
    // The checked-in, source-dated catalog is TAP's offline trust baseline.
    // Keep remote custom cards, but never let a failed catalog request turn a
    // customer's saved wallet into a stack of "Unknown card" placeholders.
    const catalogList = [
      ...verifiedCatalog,
      ...remoteCatalog.filter((card) => !canonicalIds.has(card.id)),
    ].sort((a, b) => a.issuer.localeCompare(b.issuer) || a.name.localeCompare(b.name));
    catalogList.forEach((c) => (catalog[c.id] = c));

    let userCards: UserCard[] = [];
    let offers: UserOffer[] = [];
    const cppOverrides: Record<string, number> = {};
    const accountsByUserCardId: Record<string, AccountSnapshot> = {};
    const perCardUtilization: Record<string, number> = {};
    let utilizationPrefs = {
      enabled: false,
      threshold: 0.1,
      behavior: "warn" as UtilizationBehavior,
    };
    if (user) {
      const [uc, uo, ov, ua, up] = await Promise.all([
        supabase.from("user_cards").select("*").order("created_at", { ascending: false }),
        supabase.from("user_offers").select("*").eq("user_id", user.id),
        supabase.from("user_cpp_overrides").select("*").eq("user_id", user.id),
        supabase.from("user_card_accounts").select("*").eq("user_id", user.id),
        supabase.from("user_prefs").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      const rawCards = (uc.data ?? []) as Array<UserCard & { utilization_override_pct?: number }>;
      userCards = rawCards;
      rawCards.forEach((card) => {
        if (card.utilization_override_pct != null) {
          perCardUtilization[card.id] = Number(card.utilization_override_pct) / 100;
        }
      });
      offers = (uo.data ?? [])
        .filter((offer) => !offer.is_used)
        .map((offer) => ({
          id: offer.id,
          user_id: offer.user_id,
          user_card_id: offer.user_card_id,
          merchant_catalog_id: offer.merchant_catalog_id,
          merchant_text: offer.merchant_text,
          reward_type: offer.reward_type as UserOffer["reward_type"],
          reward_value: Number(offer.reward_value),
          min_spend: Number(offer.min_spend),
          expires_at: offer.expires_at,
        }));
      (ov.data ?? []).forEach((override) => {
        cppOverrides[override.points_program_id] = Number(override.cpp);
      });
      (ua.data ?? []).forEach((account) => {
        if (!account.user_card_id || account.credit_limit_cents == null) return;
        accountsByUserCardId[account.user_card_id] = {
          limitCents: Number(account.credit_limit_cents),
          balanceCents: Number(account.current_balance_cents ?? 0),
        };
      });
      utilizationPrefs = {
        enabled: Boolean(up.data?.utilization_enabled),
        threshold: Number(up.data?.utilization_threshold_pct ?? 10) / 100,
        behavior: (up.data?.utilization_behavior as UtilizationBehavior | undefined) ?? "warn",
      };
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
      offers = g.offers.map((offer) => ({
        id: offer.id,
        user_id: "guest",
        user_card_id: offer.user_card_id,
        merchant_catalog_id: null,
        merchant_text: offer.merchant_text,
        reward_type: offer.reward_type,
        reward_value: offer.reward_value,
        min_spend: offer.min_spend,
        expires_at: offer.expires_at ?? null,
      }));
      g.overrides.forEach((override) => {
        cppOverrides[override.points_program_id] = override.cpp;
      });
      g.accounts.forEach((account) => {
        if (account.credit_limit_cents == null) return;
        accountsByUserCardId[account.user_card_id] = {
          limitCents: account.credit_limit_cents,
          balanceCents: account.current_balance_cents ?? 0,
        };
      });
      utilizationPrefs = {
        enabled: g.prefs.utilization_enabled,
        threshold: g.prefs.utilization_threshold_pct / 100,
        behavior: g.prefs.utilization_behavior,
      };
    }

    setData({
      userCards,
      catalog,
      catalogList,
      programs:
        pp.data && pp.data.length > 0
          ? (pp.data as PointsProgram[])
          : Object.values(POINT_VALUATIONS).map((valuation) => ({
              id: valuation.programId,
              name: valuation.displayName,
              kind: valuation.programId === "cashback" ? "cashback" : "transferable",
              default_cpp: valuation.cpp,
            })),
      offers,
      cppOverrides,
      accountsByUserCardId,
      perCardUtilization,
      utilizationPrefs,
      isGuest: !user,
    });
  };

  useEffect(() => {
    if (loading) return;
    void load();
  }, [user, loading]);

  useEffect(() => {
    const refreshCaps = () => setCapRevision((revision) => revision + 1);
    window.addEventListener("tap:capReached", refreshCaps);
    return () => window.removeEventListener("tap:capReached", refreshCaps);
  }, []);

  const capReachedCategoriesByCard = useMemo(() => {
    if (!data) return {};
    return capReachedByCardMap(
      user?.id ?? null,
      data.userCards.flatMap((userCard) => {
        const card = data.catalog[userCard.card_catalog_id];
        return (card?.earn_rules ?? []).flatMap((rule) =>
          rule.cap_period
            ? [
                {
                  userCardId: userCard.id,
                  category: rule.category,
                  period: rule.cap_period as CapPeriod,
                },
              ]
            : [],
        );
      }),
    );
  }, [capRevision, data, user?.id]);

  const walletRoles = useMemo(() => {
    if (!data || data.userCards.length === 0) return [];
    const programs = Object.fromEntries(data.programs.map((program) => [program.id, program]));
    return computeWalletGuide({
      userCards: data.userCards,
      catalog: data.catalog,
      programs,
      offers: data.offers,
      cppOverrides: data.cppOverrides,
      capReachedCategoriesByCard,
      utilization: {
        enabled: data.utilizationPrefs.enabled,
        accountsByUserCardId: data.accountsByUserCardId,
        threshold: data.utilizationPrefs.threshold,
        behavior: data.utilizationPrefs.behavior,
        perCardOverrides: data.perCardUtilization,
      },
    });
  }, [capReachedCategoriesByCard, data]);

  if (loading) return <div className="min-h-screen bg-background" />;

  const isEmptyList = mode === "list" && data !== null && data.userCards.length === 0;
  const showHeaderAdd = mode === "list" && !isEmptyList && data !== null;
  const selectedUserCard = data?.userCards.find((card) => card.id === search.card);
  const selectedCatalog = selectedUserCard
    ? data?.catalog[selectedUserCard.card_catalog_id]
    : undefined;

  if (selectedUserCard && selectedCatalog) {
    return (
      <WalletCardBriefing
        card={{
          id: selectedUserCard.id,
          catalogId: selectedUserCard.card_catalog_id,
          issuer: selectedCatalog.issuer,
          name: selectedCatalog.name,
          nickname: selectedUserCard.nickname,
        }}
        catalogOverride={selectedCatalog.is_custom ? selectedCatalog : undefined}
        userId={user?.id ?? null}
        onBack={() => {
          void navigate({ to: "/cards", search: {} });
        }}
        onRemove={async () => {
          if (data?.isGuest) removeGuestCard(selectedUserCard.id);
          else await supabase.from("user_cards").delete().eq("id", selectedUserCard.id);
          await load();
          void navigate({ to: "/cards", search: {} });
          toast.success("Card removed");
        }}
        onRename={async (nickname) => {
          if (data?.isGuest) updateGuestCardNickname(selectedUserCard.id, nickname || null);
          else
            await supabase
              .from("user_cards")
              .update({ nickname: nickname || null })
              .eq("id", selectedUserCard.id);
          await load();
        }}
        showTryPurchase
      />
    );
  }

  return (
    <TapAppShell className="tap-wallet-screen tap-wallet-v2">
      <header className="tap-wallet-v2-header px-6 pt-12 pb-4 flex items-center justify-between">
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
            className="inline-flex items-center gap-1 rounded-full bg-foreground text-background text-[13px] font-medium h-11 px-4 hover:opacity-90 transition-opacity"
            aria-label="Add a card"
          >
            <Plus className="size-4" strokeWidth={2.25} />
            Add
          </button>
        )}
      </header>

      <main
        className="tap-wallet-v2-main flex-1 px-6 py-2 mx-auto w-full pb-8"
        data-wallet-ready={data ? "true" : "false"}
      >
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
            roles={walletRoles}
            onChanged={load}
            onAdd={() => setMode(data.isGuest ? "catalog" : "choose")}
            onOpen={(cardId) => {
              void navigate({ to: "/cards", search: { card: cardId } });
            }}
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
    </TapAppShell>
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
  roles,
  onChanged,
  onAdd,
  onOpen,
}: {
  data: Data;
  roles: WalletRole[];
  onChanged: () => void;
  onAdd: () => void;
  onOpen: (cardId: string) => void;
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
          className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground text-background text-[14px] font-medium h-12 px-6 hover:opacity-90 transition-opacity"
        >
          <Plus className="size-4" strokeWidth={2.25} />
          Add a card
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="tap-wallet-v2-overview">
        <WalletPlaybook roles={roles} cardCount={data.userCards.length} />
        <section className="tap-wallet-v2-guides">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <p className="cs-microlabel text-[10px]">Each card's job</p>
              <h2 className="mt-1 text-[21px] font-semibold text-foreground">Your card guides</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">Tap to open</span>
          </div>
          <ul className="space-y-3 mt-3">
            {data.userCards.map((uc) => (
              <UserCardRow
                key={uc.id}
                userCard={uc}
                data={data}
                onChanged={onChanged}
                onOpen={() => onOpen(uc.id)}
              />
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function WalletPlaybook({ roles, cardCount }: { roles: WalletRole[]; cardCount: number }) {
  const roleCards = new Set(roles.map((role) => role.nickname ?? role.cardName));
  const singleCard = cardCount === 1 || roleCards.size === 1;
  const strongestRoles = roles.slice(0, 3);
  return (
    <section
      className="tap-wallet-v2-playbook mt-1 rounded-[1.75rem] bg-foreground text-background p-5 overflow-hidden relative"
      data-single-card={singleCard ? "true" : "false"}
    >
      <div
        className="absolute -right-10 -top-10 size-36 rounded-full border border-primary/35"
        aria-hidden
      />
      <div
        className="absolute -right-4 -top-4 size-20 rounded-full border border-primary/50"
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center gap-2 text-primary">
          <BookOpen className="size-4" aria-hidden />
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold">Your playbook</p>
        </div>
        <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.035em] leading-[1.02]">
          {singleCard ? "Your card’s strongest jobs." : "Know what every card is for."}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-background/70 max-w-[19rem]">
          {singleCard
            ? "These are its strongest everyday uses. Open the guide for every rate, credit, and watch-out."
            : "TAP keeps the short version here. Open any card for its credits, travel protections, fees, caps, and verified terms."}
        </p>
        <ul className="tap-wallet-v2-role-grid mt-5 grid grid-cols-2 gap-2">
          {(singleCard ? strongestRoles : roles).map((role) => (
            <li key={role.key}>
              <Link
                to="/decide"
                search={{
                  merchantName: role.merchantLabel,
                  category: role.category,
                  fromCategory: 1,
                }}
                className="min-h-[4.6rem] rounded-xl border border-background/15 bg-background/[0.04] p-3 flex flex-col justify-between gap-1 group"
                aria-label={`Try ${role.label} with ${role.nickname ?? role.cardName}`}
              >
                <span className="text-[10px] uppercase tracking-[0.12em] text-background/55">
                  {role.label}
                </span>
                <span className="w-full flex items-end gap-2">
                  <span className="flex-1 grid gap-1 text-[13px] font-semibold leading-tight">
                    <span>
                      {singleCard
                        ? `Best for ${role.label.toLowerCase()}`
                        : (role.nickname ?? role.cardName)}
                    </span>
                    {role.creditHealth.kind !== "none" ? (
                      <small
                        className="tap-wallet-v2-comparison tap-wallet-v2-credit-health"
                        data-kind={role.creditHealth.kind}
                      >
                        <strong>
                          {role.creditHealth.kind === "warning"
                            ? "Above utilization target"
                            : role.creditHealth.kind === "reranked"
                              ? "Re-ranked for credit health"
                              : "Split suggested"}
                        </strong>
                        <span>{role.creditHealth.caution}</span>
                      </small>
                    ) : role.comparisonLabel ? (
                      <small className="tap-wallet-v2-comparison">{role.comparisonLabel}</small>
                    ) : null}
                  </span>
                  <ArrowRight
                    className="size-3.5 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="tap-wallet-v2-basis mt-3 text-[10px] leading-relaxed text-background/50">
          Based on your current wallet, TAP's reward assumptions, and representative purchases.
          Confirm the exact merchant category at checkout.
        </p>
      </div>
    </section>
  );
}

function UserCardRow({
  userCard,
  data,
  onChanged,
  onOpen,
}: {
  userCard: UserCard;
  data: Data;
  onChanged: () => void;
  onOpen: () => void;
}) {
  const card = data.catalog[userCard.card_catalog_id];
  const label = userCard.nickname ?? (card ? `${card.issuer} ${card.name}` : "Unknown card");
  const subLabel = userCard.nickname && card ? `${card.issuer} ${card.name}` : null;
  const topRules = card?.earn_rules.slice(0, 3) ?? [];
  const issuerMark = (card?.issuer ?? "?")
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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

  return (
    <li
      className="relative transition-all duration-200 ease-out"
      style={{
        opacity: exiting ? 0 : 1,
        transform: exiting ? "scale(0.94) translateY(-4px)" : "none",
      }}
    >
      <div className="tap-wallet-v2-card-row rounded-2xl border border-border bg-white p-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={`Open ${label} card guide`}
        >
          <div className="tap-wallet-v2-pass" aria-hidden>
            <span>{issuerMark}</span>
            <i />
          </div>
          <div className="min-w-0 flex-1">
            <p className="tap-wallet-v2-card-name text-[15px] font-semibold text-foreground">
              {label}
            </p>
            {subLabel ? (
              <p className="tap-wallet-v2-card-issuer text-[11px] text-muted-foreground">
                {subLabel}
              </p>
            ) : null}
            {card && (topRules.length > 0 || card.is_custom || card.annual_fee > 0) ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {card.is_custom ? (
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5">
                    Custom
                  </span>
                ) : null}
                {topRules.slice(0, 2).map((rule, index) => (
                  <span
                    key={index}
                    className="tap-wallet-v2-rule text-[9px] bg-accent text-accent-foreground rounded-md px-1.5 py-0.5"
                  >
                    {rule.multiplier >= 1
                      ? `${rule.multiplier}x`
                      : `${Math.round(rule.multiplier * 100)}%`}{" "}
                    {rule.category.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="tap-wallet-v2-open mt-1.5 text-[10px] text-primary font-medium">
              Open guide →
            </p>
          </div>
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          className="inline-flex items-center justify-center shrink-0 rounded-full min-h-11 min-w-11 text-muted-foreground hover:text-destructive hover:bg-secondary/60 transition-colors"
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
            className="flex-1 inline-flex items-center justify-center h-12 rounded-xl bg-destructive text-destructive-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-70"
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
      .map((c) => c.rates_verified_on ?? c.rates_as_of)
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
                {catalogRateLabel(r.multiplier)} {r.category.replace(/_/g, " ")}
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
              // An expired session made u.user null and the ! threw — leaving
              // the button stuck on "Adding…" with no message, forever.
              if (!u.user) {
                setSaving(false);
                toast.error("Your session expired — sign in again to add cards.");
                return;
              }
              const { error } = await supabase.from("user_cards").insert({
                user_id: u.user.id,
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
          ? `Rates verified ${friendlyDate(ratesVerified)}. Verify current terms with your issuer before relying on any recommendation.`
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
