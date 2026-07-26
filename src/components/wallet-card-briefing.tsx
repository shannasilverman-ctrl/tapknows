import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Plane, ShieldCheck } from "lucide-react";
import { BenefitDetailSheet } from "@/components/benefit-detail-sheet";
import { PinnedCardDetail } from "@/components/pinned-card-detail";
import { benefitsForCard } from "@/lib/benefitState";
import type { CardBenefit } from "@/lib/benefits";
import { CATALOG_BY_ID } from "@/lib/cardCatalog";
import { isCapReached, setCapReached, type CapPeriod } from "@/lib/capReached";
import { dollars } from "@/lib/format";

export type WalletBriefingCard = {
  id: string;
  catalogId: string;
  issuer: string;
  name: string;
  nickname?: string | null;
};

type Props = {
  card: WalletBriefingCard;
  userId: string | null;
  onBack: () => void;
  onRemove?: () => void;
  onRename?: (nickname: string) => void;
  showTryPurchase?: boolean;
};

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    amazon: "Amazon",
    dining: "Dining",
    everything_else: "Everyday purchases",
    flights: "Flights",
    gas: "Gas & EV charging",
    groceries: "Groceries",
    hotels: "Hotels",
    online_groceries: "Online groceries",
    streaming: "Streaming",
    transit: "Transit",
    travel: "Travel",
    travel_portal: "Issuer travel portal",
    wholesale_clubs: "Wholesale clubs",
  };
  return labels[category] ?? category.replace(/_/g, " ");
}

function rateLabel(multiplier: number): string {
  return multiplier >= 1 ? `${multiplier}x` : `${Math.round(multiplier * 100)}%`;
}

/**
 * One canonical card guide shared by Home's tactile wallet and the Wallet
 * playbook. All rates come from the verified catalog; all benefit claims come
 * from the sourced benefit registry.
 */
export function WalletCardBriefing({
  card,
  userId,
  onBack,
  onRemove,
  onRename,
  showTryPurchase = false,
}: Props) {
  const [openBenefit, setOpenBenefit] = useState<CardBenefit | null>(null);
  const catalog = CATALOG_BY_ID[card.catalogId];
  const feeLabel = catalog?.annual_fee
    ? `${dollars(catalog.annual_fee * 100)} annual fee`
    : "No annual fee";
  const benefitStates = benefitsForCard(userId, card.catalogId);
  const redeemable = benefitStates.filter(
    (state) => state.benefit.kind === "redeemable" && state.benefit.value_cents != null,
  );
  const standing = benefitStates.filter((state) => state.benefit.kind === "standing");
  const bestRules = useMemo(
    () =>
      (catalog?.earn_rules ?? []).filter((rule) => rule.category !== "everything_else").slice(0, 4),
    [catalog],
  );
  const hasTravelBenefits =
    catalog?.foreign_tx_fee_pct === 0 || standing.some((state) => state.benefit.group === "travel");
  const groupOrder = [
    { key: "travel", label: "Travel benefits" },
    { key: "protection", label: "Protections" },
    { key: "purchase", label: "Purchase coverage" },
    { key: "membership", label: "Memberships" },
  ] as const;
  const grouped = groupOrder
    .map(({ key, label }) => ({
      key,
      label,
      items: standing.filter((state) => (state.benefit.group ?? "membership") === key),
    }))
    .filter((group) => group.items.length > 0);
  const firstTryRule = bestRules[0] ?? catalog?.earn_rules[0];

  return (
    <>
      <PinnedCardDetail
        issuer={card.issuer}
        name={card.name}
        winner
        nickname={card.nickname}
        onBack={onBack}
        onRemove={onRemove}
        onRename={onRename}
      >
        <section className="mt-6">
          <p className="cs-microlabel text-[10px]">Use this card for</p>
          <div className="mt-2 rounded-2xl border border-border bg-white overflow-hidden">
            {bestRules.length > 0 ? (
              <ul className="divide-y divide-border">
                {bestRules.map((rule) => (
                  <li
                    key={`${rule.category}-${rule.multiplier}`}
                    className="px-4 py-3 flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="text-[15px] font-medium text-foreground">
                        {categoryLabel(rule.category)}
                      </p>
                      {rule.note ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                          {rule.note}
                        </p>
                      ) : null}
                    </div>
                    <span className="cs-money text-[15px] font-semibold text-foreground">
                      {rateLabel(rule.multiplier)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-[13px] text-muted-foreground">
                TAP has not verified a specialty category for this card yet.
              </p>
            )}
          </div>
        </section>

        {hasTravelBenefits ? (
          <section className="mt-6">
            <p className="cs-microlabel text-[10px]">Travel ready</p>
            <div className="mt-2 rounded-2xl border border-border bg-white px-4 py-3">
              <div className="flex items-start gap-3">
                <Plane className="mt-0.5 size-4 text-primary shrink-0" aria-hidden />
                <div>
                  <p className="text-[14px] font-medium text-foreground">
                    {catalog?.foreign_tx_fee_pct === 0
                      ? "No foreign transaction fee"
                      : "Verified travel benefits"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">
                    {standing.some((state) => state.benefit.group === "travel")
                      ? `${standing.filter((state) => state.benefit.group === "travel").length} sourced travel protections or perks are listed below.`
                      : "Useful abroad without an extra issuer foreign-transaction fee."}
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-6">
          <p className="cs-microlabel text-[10px]">All earn rates</p>
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-white">
            {(catalog?.earn_rules ?? []).map((rule) => {
              const cap = rule.cap_period_spend ?? rule.cap_annual_spend ?? null;
              const period = (rule.cap_period ?? "annual") as CapPeriod;
              const periodShort =
                period === "monthly" ? "mo" : period === "quarterly" ? "qtr" : "yr";
              const postCap = rule.post_cap_multiplier ?? null;
              const reached =
                cap != null ? isCapReached(userId, card.id, rule.category, period) : false;
              return (
                <li key={`${rule.category}-${rule.multiplier}`} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] text-foreground">
                      {categoryLabel(rule.category)}
                    </span>
                    <span className="cs-money text-[15px] font-semibold text-foreground">
                      {rateLabel(rule.multiplier)}
                    </span>
                  </div>
                  {cap != null ? (
                    <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
                      <span>
                        Up to ${cap.toLocaleString("en-US")}/{periodShort}
                        {postCap != null ? `, then ${rateLabel(postCap)}` : ""}
                      </span>
                      <label className="inline-flex items-center gap-2 min-h-11 cursor-pointer">
                        <span>Cap reached</span>
                        <input
                          type="checkbox"
                          checked={reached}
                          onChange={(event) =>
                            setCapReached(
                              userId,
                              card.id,
                              rule.category,
                              period,
                              event.target.checked,
                            )
                          }
                          className="size-4 accent-primary"
                        />
                      </label>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {redeemable.length > 0 ? (
          <section className="mt-6">
            <p className="cs-microlabel text-[10px]">Credits to use</p>
            <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-white">
              {redeemable.map((state) => {
                const total = state.benefit.value_cents ?? 0;
                const percent =
                  total > 0 ? Math.round(((total - state.remaining_cents) / total) * 100) : 0;
                const anniversaryBased = state.benefit.note
                  ?.toLowerCase()
                  .includes("account anniversary");
                return (
                  <li key={state.benefit.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[14px] text-foreground leading-snug">
                        {state.benefit.label}
                      </span>
                      <span className="cs-money text-[14px] font-semibold text-foreground whitespace-nowrap">
                        {dollars(state.remaining_cents)} left
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {anniversaryBased
                        ? "Resets each account anniversary"
                        : `Resets ${state.ends_at.toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {grouped.map((group) => (
          <section key={group.key} className="mt-6">
            <p className="cs-microlabel text-[10px]">{group.label}</p>
            <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-white overflow-hidden">
              {group.items.map((state) => {
                const benefit = state.benefit;
                const title = benefit.title ?? benefit.label;
                return (
                  <li key={benefit.id}>
                    <button
                      type="button"
                      onClick={() => setOpenBenefit(benefit)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-11 hover:bg-secondary/40 active:scale-[0.98] transition-transform"
                      aria-label={`${title} — details`}
                    >
                      <ShieldCheck className="size-4 text-primary shrink-0" aria-hidden />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] text-foreground leading-snug">{title}</p>
                        {benefit.summary ? (
                          <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">
                            {benefit.summary}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="mt-6">
          <p className="cs-microlabel text-[10px]">Watch-outs</p>
          <div className="mt-2 rounded-2xl border border-border bg-white px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[15px] text-foreground">Annual fee</span>
              <span className="cs-money text-[15px] font-semibold text-foreground text-right">
                {feeLabel}
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <span className="text-[15px] text-foreground">Foreign transactions</span>
              <span className="cs-money text-[15px] font-semibold text-foreground">
                {catalog?.foreign_tx_fee_pct
                  ? `${catalog.foreign_tx_fee_pct}% fee`
                  : "No issuer fee"}
              </span>
            </div>
            {catalog?.notes ? (
              <p className="mt-3 pt-3 border-t border-border text-[12px] text-muted-foreground leading-relaxed">
                {catalog.notes}
              </p>
            ) : null}
            {catalog ? (
              <p className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">
                Rates verified {catalog.rates_verified_on}.{" "}
                <a
                  href={catalog.source}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2 text-foreground"
                >
                  Check current issuer terms
                </a>
                .
              </p>
            ) : (
              <p className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">
                This custom card uses the rates you entered. TAP has not independently verified its
                benefits.
              </p>
            )}
          </div>
        </section>

        {showTryPurchase && firstTryRule ? (
          <Link
            to="/home"
            className="mt-6 mb-4 w-full cs-btn-primary h-12 inline-flex items-center justify-center gap-2"
          >
            Try a purchase
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </PinnedCardDetail>
      <BenefitDetailSheet
        benefit={openBenefit}
        issuer={card.issuer}
        onClose={() => setOpenBenefit(null)}
      />
    </>
  );
}
