import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { WalletStack, type StackCard } from "@/components/wallet-stack";
import { Sheet } from "@/components/sheet";
import { LegalFooter } from "@/components/legal-footer";
import { getGuestWallet } from "@/lib/guestWallet";
import { CATALOG_BY_ID } from "@/lib/cardCatalog";
import { MERCHANTS, resolveMerchant } from "@/lib/merchantMap";
import { POINT_VALUATIONS } from "@/lib/pointValuations";
import { planPurchase, type Play } from "@/lib/planner";
import type { CardCatalog, PointsProgram, UserCard, UserOffer } from "@/lib/types";
import { dollars } from "@/lib/format";
import { ArrowLeft, Wallet, ShieldCheck, AlertTriangle, Sliders, Sparkles } from "lucide-react";
import { SeeTheMath } from "@/components/see-the-math";

import { applyPriorities, STRONG_PROTECTION_CARDS } from "@/lib/priorities";
import { recordRecovered } from "@/lib/recovered";
import { recordDecide } from "@/lib/quickPicks";
import { bumpDecideCount } from "@/lib/feedback";
import { benefitsForCard, redeem, trackBenefitSurfaced } from "@/lib/benefitState";
import { BENEFITS_BY_CARD } from "@/lib/benefits";
import { Check } from "lucide-react";

const decideSearch = z.object({
  merchant: z.string().optional(),
  merchantName: z.string().optional(),
  category: z.string().optional(),
  amount: z.coerce.number().optional(),
  fromStack: z.coerce.number().optional(),
  fromCategory: z.coerce.number().optional(),
  opp: z.string().optional(),
});

export const Route = createFileRoute("/decide")({
  validateSearch: (s) => decideSearch.parse(s),
  component: DecidePage,
});

function programsFromCatalog(cards: CardCatalog[]): Record<string, PointsProgram> {
  const out: Record<string, PointsProgram> = {};
  for (const c of cards) {
    const pid = c.points_program_id;
    if (!pid || out[pid]) continue;
    const v = POINT_VALUATIONS[pid];
    out[pid] = {
      id: pid,
      name: v?.displayName ?? pid,
      kind: pid === "cashback" ? "cashback" : "transferable",
      default_cpp: v?.cpp ?? 0.01,
    };
  }
  if (!out["cashback"]) {
    out["cashback"] = { id: "cashback", name: "Cash back", kind: "cashback", default_cpp: 0.01 };
  }
  return out;
}

function DecidePage() {
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [ready, setReady] = useState(false);
  const [amount, setAmount] = useState<number>(search.amount ?? 50);
  const [bigPurchase, setBigPurchase] = useState<boolean>((search.amount ?? 50) > 200);
  const [sheet, setSheet] = useState<null | "amount">(null);
  const [tapped, setTapped] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [raisedPlayId, setRaisedPlayId] = useState<string | null>(null);
  const [benefitRedeemedId, setBenefitRedeemedId] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement | null>(null);

  const walletLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Use this card";
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return "Open Apple Wallet";
    if (/Android/i.test(ua)) return "Open Google Wallet";
    return "Use this card";
  }, []);

  const merchant = useMemo(() => {
    if (search.merchant) {
      return MERCHANTS.find((m) => m.id === search.merchant) ?? resolveMerchant(search.merchant);
    }
    return null;
  }, [search.merchant]);
  const category = merchant?.category ?? search.category ?? "everything_else";
  const merchantName = merchant?.name ?? search.merchantName ?? "Custom purchase";
  const isCategoryFallback = !merchant && !!search.merchantName && !!search.category;

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      if (user) {
        const { data } = await supabase
          .from("user_cards")
          .select(
            "id, user_id, card_catalog_id, nickname, opened_at, annual_fee_paid_at, created_at",
          )
          .eq("user_id", user.id);
        if (!cancelled) {
          setUserCards((data ?? []) as UserCard[]);
          setReady(true);
        }
      } else {
        const g = getGuestWallet();
        const cards: UserCard[] = g.cards.map((c) => ({
          id: c.id,
          user_id: "guest",
          card_catalog_id: c.card_catalog_id,
          nickname: c.nickname ?? null,
          opened_at: null,
          annual_fee_paid_at: null,
          created_at: "",
        }));
        if (!cancelled) {
          setUserCards(cards);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  useEffect(() => {
    if (bigPurchase && amount <= 200) setAmount(250);
    if (!bigPurchase && amount > 200) setAmount(120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bigPurchase]);

  const catalog = useMemo(() => {
    const out: Record<string, CardCatalog> = {};
    for (const uc of userCards) {
      const c = CATALOG_BY_ID[uc.card_catalog_id];
      if (!c) continue;
      out[c.id] = {
        id: c.id,
        issuer: c.issuer,
        name: c.name,
        annual_fee: c.annual_fee,
        points_program_id: c.points_program_id,
        foreign_tx_fee_pct: c.foreign_tx_fee_pct,
        earn_rules: c.earn_rules,
        notes: c.notes ?? null,
      };
    }
    return out;
  }, [userCards]);

  const programs = useMemo(() => programsFromCatalog(Object.values(catalog)), [catalog]);

  const benefitsByCard = useMemo(() => {
    const map: Record<string, ReturnType<typeof benefitsForCard>> = {};
    const uid = user?.id ?? null;
    const seen = new Set<string>();
    for (const uc of userCards) {
      if (seen.has(uc.card_catalog_id)) continue;
      seen.add(uc.card_catalog_id);
      if (!BENEFITS_BY_CARD[uc.card_catalog_id]?.length) continue;
      map[uc.card_catalog_id] = benefitsForCard(uid, uc.card_catalog_id);
    }
    return map;
  }, [userCards, user?.id]);

  const rawPlays: Play[] = useMemo(() => {
    if (!ready || userCards.length === 0) return [];
    return planPurchase({
      userCards,
      catalog,
      programs,
      offers: [] as UserOffer[],
      cppOverrides: {},
      merchantCategory: category,
      amountCents: Math.round(amount * 100),
      merchant: merchant ? { id: merchant.id, name: merchant.name } : { name: merchantName },
      benefitsByCard,
    });
  }, [
    ready,
    userCards,
    catalog,
    programs,
    category,
    amount,
    merchant,
    merchantName,
    benefitsByCard,
  ]);

  const {
    plays,
    reason: priorityReason,
    utilizationCaution,
  } = useMemo(
    () => applyPriorities(rawPlays, { amountCents: Math.round(amount * 100) }),
    [rawPlays, amount],
  );

  const detectedAt = useMemo(
    () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    [],
  );

  // Reset raise + tap/record state on new plan (merchant or amount changed)
  useEffect(() => {
    setRaisedPlayId(plays[0]?.id ?? null);
    setTapped(false);
    setRecorded(false);
  }, [plays]);

  const raisedPlay = plays.find((p) => p.id === raisedPlayId) ?? plays[0] ?? null;
  const raisedIsWinner = raisedPlay?.id === plays[0]?.id;
  const reasoningLine =
    raisedPlay?.legs[0]?.reasoning ?? "Best value for this charge in your wallet.";
  const raisedHasProtections =
    !!raisedPlay && raisedPlay.legs.some((l) => STRONG_PROTECTION_CARDS.has(l.card.id));

  // Fire benefit_surfaced when the recommendation reason line references a credit.
  // Must live above the early returns so hook order is stable across loading -> ready.
  useEffect(() => {
    if (!raisedPlay) return;
    const applied = raisedPlay.legs.find((l) => l.benefitApplied)?.benefitApplied;
    if (!applied) return;
    trackBenefitSurfaced("decide_reason", {
      id: applied.benefit_id,
      card_catalog_id: applied.card_catalog_id,
    });
  }, [raisedPlay]);

  if (loading || !ready) {
    return (
      <div className="cs-app-body min-h-screen flex flex-col text-foreground">
        <header className="cs-safe-top px-5 pb-2" />
        <main className="flex-1 px-5 pb-10 max-w-md w-full mx-auto">
          <div className="mt-2 space-y-2">
            <div
              className="h-3 w-24 rounded-full bg-secondary/60 motion-safe:animate-pulse"
              aria-hidden
            />
            <div
              className="h-7 w-2/3 rounded-md bg-secondary/60 motion-safe:animate-pulse"
              aria-hidden
            />
          </div>
          <div
            className="mt-6 w-full rounded-[18px] bg-secondary/60 motion-safe:animate-pulse"
            style={{ aspectRatio: "1.586 / 1" }}
            aria-hidden
          />
          <span className="sr-only">Loading recommendation…</span>
        </main>
      </div>
    );
  }

  if (userCards.length === 0) {
    return (
      <div className="cs-app-body min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="cs-title-lg text-foreground">Add a card first</h1>
        <p className="mt-2 text-[15px] text-muted-foreground max-w-sm">
          TAP needs at least one card in your wallet to recommend.
        </p>
        <Link to="/onboarding" className="mt-6 cs-btn-primary">
          Build your wallet
        </Link>
      </div>
    );
  }

  const playFace = (p: Play) => {
    const primary = p.legs[0].card;
    const label = p.kind === "split" ? `${primary.name} + ${p.legs[1].card.name}` : primary.name;
    return { issuer: primary.issuer, name: label };
  };

  const stackCards: StackCard[] = plays.map((p) => {
    const f = playFace(p);
    const isRaised = p.id === raisedPlayId;
    const isTopWinner = p.id === plays[0]?.id;
    return {
      id: p.id,
      issuer: f.issuer,
      name: f.name,
      winner: isTopWinner,
      trailing: isRaised ? (
        <>
          <p className="cs-emboss text-[9px] uppercase tracking-[0.2em] opacity-80">Value</p>
          <p className="cs-money text-[18px] leading-none mt-1 whitespace-nowrap cs-emboss">
            {dollars(p.totalValueCents)}
          </p>
        </>
      ) : undefined,
    };
  });

  return (
    <div className="cs-app-body min-h-screen flex flex-col text-foreground">
      <header className="cs-safe-top px-5 pb-2 flex items-center justify-between">
        <button
          onClick={() => navigate({ to: "/home" })}
          className="inline-flex items-center gap-1 text-[15px] text-primary hover:opacity-80 transition-opacity"
        >
          <ArrowLeft className="size-5" />
          Wallet
        </button>
        <button
          onClick={() => setSheet("amount")}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors rounded-full px-3 py-1.5 border border-border bg-white"
        >
          <Sliders className="size-3.5" />
          {dollars(Math.round(amount * 100))}
        </button>
      </header>

      <main className="flex-1 px-5 pb-10 max-w-md w-full mx-auto">
        {/* Merchant header */}
        <div className="mt-2">
          <p className="cs-microlabel text-[10px]">Checked · {detectedAt}</p>
          <h1 className="cs-title-lg mt-1 text-foreground">{merchantName}</h1>
          <button
            type="button"
            onClick={() => setSheet("amount")}
            className="mt-1 text-[13px] text-muted-foreground capitalize hover:text-foreground transition-colors text-left"
          >
            {category.replace(/_/g, " ")} ·{" "}
            <span className="text-foreground font-medium underline underline-offset-2 decoration-border-strong">
              {dollars(Math.round(amount * 100))}
            </span>
          </button>
          {isCategoryFallback && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Based on category. TAP learns exact merchants over time.
            </p>
          )}
          {search.opp && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-primary/8 border border-primary/20 px-3 py-2">
              <Sparkles className="size-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[12px] text-foreground leading-snug">{search.opp}</p>
            </div>
          )}
        </div>

        {/* The physical recommendation — raised card + receded stack.
            enterFromStack replays the "pile → winner rises" beat so decide
            reads as a continuation of the home stack, not a page swap. */}
        <div className="mt-6">
          {plays.length > 0 ? (
            <WalletStack
              cards={stackCards}
              raisedId={raisedPlayId}
              onRaise={(id) => setRaisedPlayId(id)}
              enterFromStack={!!search.fromStack}
            />
          ) : (
            <div className="text-center">
              <p className="text-[14px] text-muted-foreground">
                No card in your wallet earns extra here.
              </p>
              <Link
                to="/onboarding"
                className="mt-4 inline-flex items-center justify-center cs-btn-secondary h-11 px-5 text-[14px]"
              >
                Add a broader card
              </Link>
            </div>
          )}
        </div>

        {/* Reasoning under the raised card */}
        {raisedPlay ? (
          <div className="mt-5">
            <p className="cs-microlabel text-[10px]">
              {raisedIsWinner ? "Tap this card" : "If you use this card"}
            </p>
            <p className="mt-1.5 text-[15px] leading-snug text-foreground">{reasoningLine}</p>
            {!raisedIsWinner && plays[0] && (
              <button
                onClick={() => setRaisedPlayId(plays[0].id)}
                className="mt-3 text-[13px] text-primary font-medium hover:opacity-80 transition-opacity"
              >
                Raise the recommended card →
              </button>
            )}
          </div>
        ) : null}

        {/* See the math — proof panel using engine-computed values only. */}
        {raisedPlay ? (
          <SeeTheMath
            winner={raisedPlay}
            runnerUp={plays.find((p) => p.id !== raisedPlay.id) ?? null}
            amountCents={Math.round(amount * 100)}
          />
        ) : null}

        {/* Priority + protection + utilization notes */}
        {(priorityReason || raisedHasProtections || utilizationCaution) && (
          <div className="mt-4 space-y-2">
            {priorityReason && (
              <div className="flex items-start gap-2.5 rounded-xl bg-primary/8 border border-primary/20 px-3.5 py-2.5">
                <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[13px] text-foreground leading-snug">{priorityReason}</p>
              </div>
            )}
            {!priorityReason && raisedHasProtections && (
              <div className="flex items-start gap-2.5 rounded-xl bg-white border border-border px-3.5 py-2.5">
                <ShieldCheck className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[13px] text-muted-foreground leading-snug">
                  Includes strong purchase and travel protections.
                </p>
              </div>
            )}
            {utilizationCaution && (
              <div className="flex items-start gap-2.5 rounded-xl bg-destructive/8 border border-destructive/30 px-3.5 py-2.5">
                <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-[13px] text-foreground leading-snug">{utilizationCaution}</p>
              </div>
            )}
          </div>
        )}

        {/* CTA — platform-aware label. Records exactly once per plan. */}
        <button
          onClick={() => {
            if (!recorded) {
              if (raisedPlay) {
                const baseline = Math.round(amount * 100 * 0.01);
                const delta = Math.max(0, raisedPlay.totalValueCents - baseline);
                if (delta > 0) recordRecovered(delta);
              }
              if (merchant) recordDecide(merchant.id, category);
              bumpDecideCount();
              setRecorded(true);
            }
            setTapped(true);
            // Smooth-scroll the receipt into view on the next frame.
            requestAnimationFrame(() => {
              receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
          }}
          disabled={recorded}
          className="mt-6 w-full cs-btn-primary h-14 text-[15px] disabled:opacity-100"
        >
          {recorded ? (
            <>
              <Check className="size-5" />
              Card chosen
            </>
          ) : (
            <>
              <Wallet className="size-5" />
              {walletLabel}
            </>
          )}
        </button>

        {/* Earnings receipt after acting */}
        {tapped && raisedPlay && (
          <div
            ref={receiptRef}
            className="mt-4 rounded-2xl bg-white border border-dashed border-border-strong px-4 py-3.5 cs-result-in"
          >
            <p className="cs-microlabel text-[10px]">Receipt</p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <p className="text-[14px] text-foreground">This tap earns about</p>
              <p className="cs-money text-[18px] font-semibold text-foreground whitespace-nowrap">
                {dollars(raisedPlay.totalValueCents)}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Estimated from your point valuations on a {dollars(Math.round(amount * 100))} charge.
            </p>
            {/* Inline benefit redeem — one tap, honesty rule preserved */}
            {(() => {
              const applied = raisedPlay.legs.find((l) => l.benefitApplied)?.benefitApplied;
              if (!applied) return null;
              const key = `${applied.card_catalog_id}::${applied.benefit_id}`;
              const done = benefitRedeemedId === key;
              return (
                <div className="mt-3 rounded-xl bg-primary/8 border border-primary/20 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[12px] text-foreground leading-snug">
                      Uses {dollars(applied.applied_cents)} of your {applied.label} credit.
                    </p>
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-primary shrink-0">
                        <Check className="size-3.5" />
                        Redeemed
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const list = BENEFITS_BY_CARD[applied.card_catalog_id] ?? [];
                          const b = list.find((x) => x.id === applied.benefit_id);
                          if (!b) return;
                          redeem(user?.id ?? null, b, applied.applied_cents);
                          setBenefitRedeemedId(key);
                        }}
                        className="shrink-0 inline-flex items-center h-8 px-3 rounded-full bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition-opacity"
                      >
                        Mark used
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            <button
              onClick={() => {
                let firstDecide = false;
                try {
                  if (!window.localStorage.getItem("tap.firstDecideDone")) {
                    window.localStorage.setItem("tap.firstDecideDone", new Date().toISOString());

                    firstDecide = true;
                  }
                } catch {}
                navigate({
                  to: "/home",
                  search: firstDecide ? { pushAsk: 1 } : {},
                });
              }}
              className="mt-3 w-full cs-btn-secondary h-11 text-[14px]"
            >
              Back to wallet
            </button>
          </div>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground text-center">
          Tap a receded card to see what it would earn instead.
        </p>
      </main>

      <LegalFooter compact />

      {/* Bottom sheet: amount + big purchase */}
      <Sheet open={sheet === "amount"} onClose={() => setSheet(null)} title="Charge amount">
        <div className="space-y-4">
          <div className="rounded-2xl bg-secondary/60 px-4 py-3 flex items-center justify-between">
            <label htmlFor="amt" className="text-[15px] text-foreground">
              Amount
            </label>
            <div className="flex items-center gap-1">
              <span className="text-[15px] text-muted-foreground">$</span>
              <input
                id="amt"
                type="number"
                inputMode="decimal"
                enterKeyHint="done"
                autoFocus
                min={0}
                max={99999}
                value={amount}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (!Number.isFinite(raw)) return setAmount(0);
                  setAmount(Math.min(99999, Math.max(0, raw)));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).blur();
                    setSheet(null);
                  }
                }}
                className="w-24 text-right bg-transparent text-[17px] text-foreground focus:outline-none cs-money"
              />
            </div>
          </div>

          <div className="flex gap-2">
            {[25, 50, 100, 250].map((v) => {
              const active = Math.round(amount) === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(v)}
                  className={`flex-1 h-11 rounded-full text-[14px] font-medium transition-colors cs-money ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-white border border-border text-foreground hover:border-primary/40"
                  }`}
                >
                  ${v}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-secondary/60 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[15px] font-medium text-foreground">Big purchase</p>
              <p className="text-[12px] text-muted-foreground">Over $200 changes some recs</p>
            </div>
            <button
              role="switch"
              aria-checked={bigPurchase}
              onClick={() => setBigPurchase((b) => !b)}
              className={`relative inline-flex h-[31px] w-[51px] items-center rounded-full transition-colors ${
                bigPurchase ? "bg-primary" : "bg-border-strong"
              }`}
            >
              <span
                className={`inline-block size-[27px] rounded-full bg-white shadow-sm transition-transform ${
                  bigPurchase ? "translate-x-[22px]" : "translate-x-[2px]"
                }`}
              />
            </button>
          </div>

          <button onClick={() => setSheet(null)} className="w-full cs-btn-primary h-12">
            Done
          </button>
        </div>
      </Sheet>
    </div>
  );
}
