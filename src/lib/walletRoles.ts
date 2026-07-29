// Wallet roles — derived from the exact same planner the engine uses.
// Given a wallet, for each "spend domain" (everyday, groceries, dining, gas,
// travel, online) we run planPurchase at a representative amount and take
// the top play as the winner. A role is only assigned when the domain has
// a real specialist — i.e. the domain winner is a different card from the
// everyday winner. A one-card wallet therefore only ever shows "Everyday".
//
// The role engine is intentionally thin — it calls the same math the test
// suite pins so we can't drift.

import type { CardCatalog, PointsProgram, UserCard, UserOffer } from "./types";
import { planPurchase, type Play } from "./planner";
import { applyDecideUtilization } from "./decideUtilization";
import type { AccountSnapshot, UtilizationBehavior } from "./utilizationFilter";

export type WalletRoleKey = "everyday" | "groceries" | "dining" | "gas" | "travel" | "online";

export type WalletRoleCreditHealth =
  | { kind: "none"; caution: null }
  | { kind: "warning"; caution: string }
  | { kind: "reranked"; caution: string }
  | { kind: "split-suggested"; caution: string };

export type WalletRole = {
  key: WalletRoleKey;
  label: string; // "Everyday", "Groceries", …
  category: string; // planner category slug — used to deep-link decide
  merchantLabel: string; // shown to decide as merchantName in the fallback path
  userCardId: string;
  cardCatalogId: string;
  cardIssuer: string;
  cardName: string;
  nickname: string | null;
  reasoning: string; // one-line why, drawn from the planner leg
  valueCents: number; // representative-amount value for this domain
  deltaCents: number | null;
  comparisonLabel: string | null;
  creditHealth: WalletRoleCreditHealth;
};

type Domain = {
  key: WalletRoleKey;
  label: string;
  category: string;
  merchantLabel: string;
  amountCents: number;
};

// Representative amounts chosen so the earn rate — not the amount — decides
// the winner. Kept small enough to sit under monthly Custom Cash-style caps
// so specialists aren't penalized in the role sweep.
const DOMAINS: Domain[] = [
  {
    key: "everyday",
    label: "Everyday",
    category: "everything_else",
    merchantLabel: "Everyday purchase",
    amountCents: 5000,
  },
  {
    key: "groceries",
    label: "Groceries",
    category: "groceries",
    merchantLabel: "Grocery run",
    amountCents: 10000,
  },
  {
    key: "dining",
    label: "Dining",
    category: "dining",
    merchantLabel: "Dining out",
    amountCents: 5000,
  },
  { key: "gas", label: "Gas", category: "gas", merchantLabel: "Gas fill-up", amountCents: 5000 },
  {
    key: "travel",
    label: "Travel",
    category: "travel",
    merchantLabel: "Travel booking",
    amountCents: 20000,
  },
  {
    key: "online",
    label: "Online",
    category: "amazon",
    merchantLabel: "Online shopping",
    amountCents: 5000,
  },
];

export type WalletRoleInput = {
  userCards: UserCard[];
  catalog: Record<string, CardCatalog>;
  programs: Record<string, PointsProgram>;
  // Optional frecency map: userCardId -> weight (higher = more recent/frequent).
  // Used only to tie-break the everyday role when two cards return the same value.
  frecencyByCardId?: Record<string, number>;
  offers?: UserOffer[];
  cppOverrides?: Record<string, number>;
  capReachedCategoriesByCard?: Record<string, string[]>;
  utilization?: {
    enabled: boolean;
    accountsByUserCardId: Record<string, AccountSnapshot>;
    threshold: number;
    behavior: UtilizationBehavior;
    perCardOverrides?: Record<string, number>;
  };
};

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function offerIsRelevant(offer: UserOffer, domain: Domain) {
  const merchant = normalized(offer.merchant_text);
  const jobMerchant = normalized(domain.merchantLabel);
  if (!merchant || !jobMerchant) return false;
  if (
    merchant === jobMerchant ||
    merchant.includes(jobMerchant) ||
    jobMerchant.includes(merchant)
  ) {
    return true;
  }
  // The online role represents Amazon explicitly in the planner category.
  return domain.category === "amazon" && merchant.includes("amazon");
}

function runDomain(
  input: WalletRoleInput,
  d: Domain,
): { plays: Play[]; creditHealth: WalletRoleCreditHealth } {
  const basePlays = planPurchase({
    userCards: input.userCards,
    catalog: input.catalog,
    programs: input.programs,
    offers: (input.offers ?? []).filter((offer) => offerIsRelevant(offer, d)),
    cppOverrides: input.cppOverrides ?? {},
    merchantCategory: d.category,
    amountCents: d.amountCents,
    merchant: { name: d.merchantLabel },
    capReachedCategoriesByCard: input.capReachedCategoriesByCard,
  });
  if (!input.utilization?.enabled) {
    return { plays: basePlays, creditHealth: { kind: "none", caution: null } };
  }
  const adjusted = applyDecideUtilization({
    plays: basePlays,
    accountsByUserCardId: input.utilization.accountsByUserCardId,
    threshold: input.utilization.threshold,
    behavior: input.utilization.behavior,
    perCardOverrides: input.utilization.perCardOverrides,
  });
  const creditHealth: WalletRoleCreditHealth =
    adjusted.behaviorApplied === "warn"
      ? {
          kind: "warning",
          caution: adjusted.caution ?? "This purchase is above your saved utilization target.",
        }
      : adjusted.behaviorApplied === "reranked"
        ? {
            kind: "reranked",
            caution:
              adjusted.caution ??
              "TAP re-ranked this job to stay within your saved utilization target.",
          }
        : adjusted.behaviorApplied === "split-suggested"
          ? {
              kind: "split-suggested",
              caution:
                adjusted.caution ??
                "TAP suggests splitting this purchase to stay within your saved utilization target.",
            }
          : { kind: "none", caution: null };
  return {
    plays: adjusted.plays,
    creditHealth,
  };
}

function comparisonLabel(deltaCents: number | null, winnerValueCents: number) {
  if (deltaCents == null) return null;
  if (deltaCents <= Math.max(25, Math.round(winnerValueCents * 0.1))) return "Close call";
  return `Est. +$${(deltaCents / 100).toFixed(2)} vs. next card`;
}

function toRole(
  d: Domain,
  p: Play,
  runnerUp: Play | undefined,
  creditHealth: WalletRoleCreditHealth,
): WalletRole | null {
  const leg = p.legs[0];
  if (!leg) return null;
  const deltaCents = runnerUp ? Math.max(0, p.totalValueCents - runnerUp.totalValueCents) : null;
  return {
    key: d.key,
    label: d.label,
    category: d.category,
    merchantLabel: d.merchantLabel,
    userCardId: leg.userCardId,
    cardCatalogId: leg.card.id,
    cardIssuer: leg.card.issuer,
    cardName: leg.card.name,
    nickname: leg.nickname,
    reasoning: leg.reasoning,
    valueCents: p.totalValueCents,
    deltaCents,
    comparisonLabel: comparisonLabel(deltaCents, p.totalValueCents),
    creditHealth,
  };
}

// A "meaningful" specialist beats the everyday winner by more than rounding.
// If two cards return the same value at this domain we treat that as no
// specialist and the domain is just the everyday card.
function beatsEveryday(domainValue: number, everydayValue: number): boolean {
  const diff = domainValue - everydayValue;
  return diff >= 5; // at least 5¢ better at the representative amount
}

export function computeWalletRoles(input: WalletRoleInput): WalletRole[] {
  const { userCards, frecencyByCardId } = input;
  if (userCards.length === 0) return [];

  // 1. Everyday winner — with frecency tiebreak.
  const everydayDomain = DOMAINS[0];
  const everydayResult = runDomain(input, everydayDomain);
  const everydayPlays = everydayResult.plays;
  if (!everydayPlays.length) return [];
  const topEverydayValue = everydayPlays[0].totalValueCents;
  const everydayTies = everydayPlays.filter((p) => p.totalValueCents === topEverydayValue);
  let everydayPlay = everydayTies[0];
  if (everydayTies.length > 1 && frecencyByCardId) {
    everydayPlay = [...everydayTies].sort(
      (a, b) =>
        (frecencyByCardId[b.legs[0].userCardId] ?? 0) -
        (frecencyByCardId[a.legs[0].userCardId] ?? 0),
    )[0];
  }
  const everydayRole = toRole(
    everydayDomain,
    everydayPlay,
    everydayPlays.find((play) => play !== everydayPlay),
    everydayResult.creditHealth,
  );
  if (!everydayRole) return [];

  const roles: WalletRole[] = [everydayRole];

  // 2. Specialist domains — assigned only when the winner is a different card
  //    AND the domain value beats the everyday value by more than rounding.
  for (const d of DOMAINS.slice(1)) {
    const domainResult = runDomain(input, d);
    const plays = domainResult.plays;
    const winner = plays[0];
    if (!winner) continue;
    const role = toRole(d, winner, plays[1], domainResult.creditHealth);
    if (!role) continue;
    if (role.userCardId === everydayRole.userCardId) continue;
    if (!beatsEveryday(role.valueCents, everydayRole.valueCents)) continue;
    roles.push(role);
  }

  return roles;
}

/**
 * Full briefing view of the wallet. Unlike computeWalletRoles (which keeps
 * Home compact by showing only distinct specialists), this returns the winner
 * for every common situation—even when the same card wins more than one.
 */
export function computeWalletGuide(input: WalletRoleInput): WalletRole[] {
  if (input.userCards.length === 0) return [];
  return DOMAINS.map((domain) => {
    const result = runDomain(input, domain);
    const winner = result.plays[0];
    return winner ? toRole(domain, winner, result.plays[1], result.creditHealth) : null;
  }).filter((role): role is WalletRole => role !== null);
}
