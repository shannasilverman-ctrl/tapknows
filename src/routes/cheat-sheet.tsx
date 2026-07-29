import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, Search, ShieldCheck, Sparkles } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { CardFace } from "@/components/card-face";
import { TapAppShell } from "@/components/tap-primitives";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { CARD_CATALOG, RATES_VERIFIED_ON } from "@/lib/cardCatalog";
import { buildCheatSheetPicks } from "@/lib/cheatSheet";
import { getGuestWallet } from "@/lib/guestWallet";
import {
  POINT_VALUATIONS,
  VALUATIONS_VERIFIED_ON,
  VALUATION_SOURCE_LABEL,
} from "@/lib/pointValuations";
import type { EarnRule, EngineCard, EngineOffer } from "@/lib/recommendationEngine";
import { capReachedByCardMap, type CapPeriod } from "@/lib/capReached";
import type { AccountSnapshot, UtilizationBehavior } from "@/lib/utilizationFilter";

export const Route = createFileRoute("/cheat-sheet")({
  component: CheatSheetPage,
});

type CatalogRow = {
  id: string;
  issuer: string;
  name: string;
  points_program_id: string | null;
  foreign_tx_fee_pct: number;
  earn_rules: EarnRule[];
};

type Loaded = {
  wallet: EngineCard[];
  offers: EngineOffer[];
  valuations: Record<string, number>;
  customValuationProgramIds: string[];
  accounts: Record<string, AccountSnapshot>;
  perCardOverrides: Record<string, number>;
  prefs: {
    utilization_enabled: boolean;
    utilization_threshold_pct: number;
    utilization_behavior: UtilizationBehavior;
  };
};

function localCatalog(): Record<string, CatalogRow> {
  return Object.fromEntries(
    CARD_CATALOG.map((card) => [
      card.id,
      {
        id: card.id,
        issuer: card.issuer,
        name: card.name,
        points_program_id: card.points_program_id,
        foreign_tx_fee_pct: card.foreign_tx_fee_pct,
        earn_rules: card.earn_rules,
      },
    ]),
  );
}

function hydrateCard(
  id: string,
  catalogId: string,
  nickname: string | null | undefined,
  catalog: Record<string, CatalogRow>,
): EngineCard | null {
  const card = catalog[catalogId];
  if (!card) return null;
  return {
    id,
    card_catalog_id: catalogId,
    nickname: nickname ?? null,
    issuer: card.issuer,
    name: card.name,
    points_program_id: card.points_program_id,
    foreign_tx_fee_pct: Number(card.foreign_tx_fee_pct),
    earn_rules: card.earn_rules,
  };
}

function friendlyDate(value: string) {
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

function CheatSheetPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const load = async () => {
      setData(null);
      setLoadError(false);
      try {
        const catalog = localCatalog();
        const valuations = Object.fromEntries(
          Object.values(POINT_VALUATIONS).map((value) => [value.programId, value.cpp * 100]),
        );

        if (!user) {
          const guest = getGuestWallet();
          const wallet = guest.cards
            .map((card) => hydrateCard(card.id, card.card_catalog_id, card.nickname, catalog))
            .filter((card): card is EngineCard => Boolean(card));
          guest.overrides.forEach((override) => {
            valuations[override.points_program_id] = override.cpp * 100;
          });
          const offers: EngineOffer[] = guest.offers.map((offer) => ({
            id: offer.id,
            user_card_id: offer.user_card_id,
            merchant: offer.merchant_text,
            offer_type: offer.offer_type,
            discount_amount: offer.reward_value,
            spend_threshold: offer.min_spend,
            max_benefit: offer.max_benefit ?? null,
            expires_on: offer.expires_at ?? null,
          }));
          const accounts: Record<string, AccountSnapshot> = {};
          guest.accounts.forEach((account) => {
            if (account.credit_limit_cents == null) return;
            accounts[account.user_card_id] = {
              limitCents: account.credit_limit_cents,
              balanceCents: account.current_balance_cents ?? 0,
            };
          });
          if (!cancelled) {
            setData({
              wallet,
              offers,
              valuations,
              customValuationProgramIds: guest.overrides.map(
                (override) => override.points_program_id,
              ),
              accounts,
              perCardOverrides: {},
              prefs: guest.prefs,
            });
          }
          return;
        }

        const [
          catalogResult,
          programResult,
          cardResult,
          offerResult,
          overrideResult,
          accountResult,
          prefResult,
        ] = await Promise.all([
          supabase.from("cards_catalog").select("*"),
          supabase.from("points_programs").select("*"),
          supabase.from("user_cards").select("*").eq("user_id", user.id),
          supabase.from("user_offers").select("*").eq("user_id", user.id),
          supabase.from("user_cpp_overrides").select("*").eq("user_id", user.id),
          supabase.from("user_card_accounts").select("*").eq("user_id", user.id),
          supabase.from("user_prefs").select("*").eq("user_id", user.id).maybeSingle(),
        ]);
        const failed = [
          catalogResult,
          programResult,
          cardResult,
          offerResult,
          overrideResult,
          accountResult,
          prefResult,
        ].some((result) => Boolean(result.error));
        if (failed) throw new Error("wallet_load_failed");

        (catalogResult.data ?? []).forEach((card) => {
          if (catalog[card.id]) return;
          catalog[card.id] = {
            id: card.id,
            issuer: card.issuer,
            name: card.name,
            points_program_id: card.points_program_id,
            foreign_tx_fee_pct: Number(card.foreign_tx_fee_pct),
            earn_rules: (card.earn_rules as unknown as EarnRule[]) ?? [],
          };
        });
        (programResult.data ?? []).forEach((program) => {
          valuations[program.id] = Number(program.default_cpp) * 100;
        });
        (overrideResult.data ?? []).forEach((override) => {
          valuations[override.points_program_id] = Number(override.cpp) * 100;
        });

        const wallet = (cardResult.data ?? [])
          .map((card) => hydrateCard(card.id, card.card_catalog_id, card.nickname, catalog))
          .filter((card): card is EngineCard => Boolean(card));
        if (wallet.length !== (cardResult.data ?? []).length) {
          throw new Error("wallet_catalog_incomplete");
        }
        const perCardOverrides: Record<string, number> = {};
        (cardResult.data ?? []).forEach((card) => {
          if (card.utilization_override_pct != null) {
            perCardOverrides[card.id] = card.utilization_override_pct / 100;
          }
        });
        const accounts: Record<string, AccountSnapshot> = {};
        (accountResult.data ?? []).forEach((account) => {
          if (!account.user_card_id || account.credit_limit_cents == null) return;
          accounts[account.user_card_id] = {
            limitCents: Number(account.credit_limit_cents),
            balanceCents: Number(account.current_balance_cents ?? 0),
          };
        });
        const prefs = prefResult.data
          ? {
              utilization_enabled: Boolean(prefResult.data.utilization_enabled),
              utilization_threshold_pct: prefResult.data.utilization_threshold_pct ?? 10,
              utilization_behavior:
                (prefResult.data.utilization_behavior as UtilizationBehavior) ?? "warn",
            }
          : {
              utilization_enabled: false,
              utilization_threshold_pct: 10,
              utilization_behavior: "warn" as UtilizationBehavior,
            };
        const offers: EngineOffer[] = (offerResult.data ?? []).map((offer) => ({
          id: offer.id,
          user_card_id: offer.user_card_id,
          merchant: offer.merchant_text,
          offer_type:
            (offer.offer_type as EngineOffer["offer_type"]) ??
            (offer.reward_type === "statement_credit"
              ? "dollars_off_threshold"
              : (offer.reward_type as EngineOffer["offer_type"])),
          discount_amount: Number(offer.reward_value),
          spend_threshold: offer.min_spend,
          max_benefit: offer.max_benefit != null ? Number(offer.max_benefit) : null,
          expires_on: offer.expires_at,
          is_used: offer.is_used ?? false,
        }));
        if (!cancelled) {
          setData({
            wallet,
            offers,
            valuations,
            customValuationProgramIds: (overrideResult.data ?? []).map(
              (override) => override.points_program_id,
            ),
            accounts,
            perCardOverrides,
            prefs,
          });
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [loading, reloadKey, user]);

  const capReached = useMemo(
    () =>
      capReachedByCardMap(
        user?.id ?? null,
        (data?.wallet ?? []).flatMap((card) =>
          card.earn_rules.flatMap((rule) =>
            rule.cap_period
              ? [
                  {
                    userCardId: card.id,
                    category: rule.category,
                    period: rule.cap_period as CapPeriod,
                  },
                ]
              : [],
          ),
        ),
      ),
    [data?.wallet, user?.id],
  );
  const picks = useMemo(
    () =>
      data
        ? buildCheatSheetPicks({
            wallet: data.wallet,
            offers: data.offers,
            valuations: data.valuations,
            customValuationProgramIds: data.customValuationProgramIds,
            capReachedCategoriesByCard: capReached,
            utilization: {
              enabled: data.prefs.utilization_enabled,
              accountsByUserCardId: data.accounts,
              threshold: data.prefs.utilization_threshold_pct / 100,
              behavior: data.prefs.utilization_behavior,
              perCardOverrides: data.perCardOverrides,
            },
          })
        : [],
    [capReached, data],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return picks;
    return picks.filter((pick) =>
      [pick.category, pick.hint, pick.issuerLabel, pick.cardLabel]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [picks, query]);

  const everydayCards = useMemo(() => {
    const counts = new Map<string, number>();
    picks.forEach((pick) => {
      pick.cards.forEach((card) => counts.set(card.id, (counts.get(card.id) ?? 0) + 1));
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => data?.wallet.find((card) => card.id === id))
      .filter((card): card is EngineCard => Boolean(card));
  }, [data?.wallet, picks]);
  const valuationAssumptions = useMemo(
    () => [...new Set(picks.flatMap((pick) => (pick.valuationLabel ? [pick.valuationLabel] : [])))],
    [picks],
  );
  const hasTravelValueEstimate = useMemo(
    () => data?.wallet.some((card) => card.points_program_id !== "cashback") ?? false,
    [data?.wallet],
  );

  return (
    <TapAppShell className="tap-app-shell tap-cheat-page tap-cheat-v2">
      <main className="tap-cheat-main">
        <header className="tap-cheat-header tap-cheat-v2-header">
          <div>
            <p className="tap-cheat-eyebrow">YOUR PERSONAL PLAYBOOK</p>
            <h1>Your one-glance card plan.</h1>
            <p>Keep this open at checkout—or print it once and know what to tap.</p>
          </div>
          <button type="button" className="tap-cheat-print" onClick={() => window.print()}>
            <Download aria-hidden />
            Print or save as PDF
          </button>
        </header>

        {!data && !loadError ? (
          <div className="tap-cheat-loading" role="status" aria-label="Building your card plan" />
        ) : loadError ? (
          <section className="tap-cheat-empty" role="alert">
            <span>
              <ShieldCheck aria-hidden />
            </span>
            <h2>We couldn't load your wallet.</h2>
            <p>Your saved cards are still there. Check your connection and try again.</p>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
              Try again
            </button>
          </section>
        ) : data!.wallet.length === 0 ? (
          <section className="tap-cheat-empty">
            <span>
              <Sparkles aria-hidden />
            </span>
            <h2>Add your cards. Get your whole plan.</h2>
            <p>
              TAP only needs the card names—not account numbers, expiration dates, or bank access.
            </p>
            <Link to="/cards">
              Add my first card <ArrowRight aria-hidden />
            </Link>
          </section>
        ) : (
          <>
            {everydayCards.length > 1 ? (
              <section className="tap-cheat-carry">
                <div>
                  <p className="tap-cheat-section-label">USE THESE MOST OFTEN</p>
                  <h2>Your front-of-wallet cards</h2>
                  <p>These cards win the most everyday categories in your current wallet.</p>
                </div>
                <div className="tap-cheat-card-stack" aria-label="Your most useful cards">
                  {everydayCards.map((card, index) => (
                    <div
                      className="tap-cheat-card"
                      key={card.id}
                      style={{ "--tap-card-index": index } as React.CSSProperties}
                    >
                      <CardFace issuer={card.issuer} name={card.name} showNumber={false} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section
              className="tap-cheat-plan tap-cheat-v2-plan"
              aria-labelledby="cheat-answers-title"
            >
              <div className="tap-cheat-toolbar tap-cheat-v2-toolbar">
                <div>
                  <p className="tap-cheat-section-label">WHAT TO TAP</p>
                  <h2 id="cheat-answers-title">Your everyday answers</h2>
                  <p className="tap-cheat-basis">Compared on a representative $100 purchase</p>
                </div>
                <label className="tap-cheat-search">
                  <Search aria-hidden />
                  <span className="sr-only">Search your card plan</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search dining, travel, a card…"
                  />
                </label>
              </div>

              <div className="tap-cheat-v2-assumptions" aria-label="Plan assumptions">
                <strong>Assumptions</strong>
                <span>
                  {valuationAssumptions.length
                    ? valuationAssumptions.join(" · ")
                    : "Cash back shown at face value"}
                </span>
                {hasTravelValueEstimate ? (
                  <span>Travel-value estimates are not cash · basis: {VALUATION_SOURCE_LABEL}</span>
                ) : null}
                <span>Credit-health guidance uses the same $100 example when enabled.</span>
              </div>

              <div aria-live="polite" aria-atomic="true" className="sr-only">
                {filtered.length} {filtered.length === 1 ? "answer" : "answers"} shown
              </div>
              {filtered.length ? (
                <div
                  className="tap-cheat-grid tap-cheat-v2-table"
                  data-testid="cheat-sheet-results"
                >
                  <div className="tap-cheat-v2-table-head" aria-hidden>
                    <span>Purchase</span>
                    <span>Card</span>
                    <span>Earn</span>
                    <span>Condition</span>
                  </div>
                  {filtered.map((pick) => (
                    <article
                      className="tap-cheat-row tap-cheat-v2-row"
                      key={pick.categoryId}
                      aria-label={`${pick.category}: ${pick.cards.length > 1 ? "use" : "tap"} ${pick.cardLabel}`}
                    >
                      <div className="tap-cheat-category">
                        <div>
                          <h3>{pick.category}</h3>
                          <p>{pick.hint}</p>
                        </div>
                      </div>
                      <div className="tap-cheat-answer">
                        <p>{pick.cards.length > 1 ? "Use" : "Tap"}</p>
                        <strong>{pick.cardLabel}</strong>
                      </div>
                      <div className="tap-cheat-rate">
                        <strong>{pick.rateLabel}</strong>
                        <span>{pick.valueLabel}</span>
                      </div>
                      <div
                        className="tap-cheat-exception tap-cheat-v2-condition"
                        data-empty={pick.exception ? "false" : "true"}
                      >
                        {pick.exception ? <span>{pick.exception}</span> : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="tap-cheat-no-results">No card-plan matches for “{query}”.</p>
              )}
            </section>

            <section className="tap-cheat-trust tap-cheat-v2-trust">
              <ShieldCheck aria-hidden />
              <div>
                <strong>Built from your wallet, never an affiliate ranking.</strong>
                <p>
                  Card terms checked {friendlyDate(RATES_VERIFIED_ON)}; point estimates checked{" "}
                  {friendlyDate(VALUATIONS_VERIFIED_ON)}. Merchant coding and issuer terms can
                  change.
                </p>
              </div>
              <Link to="/plan">
                Plan a specific purchase <ArrowRight aria-hidden />
              </Link>
            </section>
          </>
        )}
      </main>
      <BottomNav />
    </TapAppShell>
  );
}
