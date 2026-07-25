// Wallet roles — derived from the exact same planner the engine uses.
// Given a wallet, for each "spend domain" (everyday, groceries, dining, gas,
// travel, online) we run planPurchase at a representative amount and take
// the top play as the winner. A role is only assigned when the domain has
// a real specialist — i.e. the domain winner is a different card from the
// everyday winner. A one-card wallet therefore only ever shows "Everyday".
//
// The role engine is intentionally thin — it calls the same math the test
// suite pins so we can't drift.

import type { CardCatalog, PointsProgram, UserCard } from "./types";
import { planPurchase, type Play } from "./planner";

export type WalletRoleKey = "everyday" | "groceries" | "dining" | "gas" | "travel" | "online";

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
};

function runDomain(input: WalletRoleInput, d: Domain): Play[] {
  return planPurchase({
    userCards: input.userCards,
    catalog: input.catalog,
    programs: input.programs,
    offers: [],
    cppOverrides: {},
    merchantCategory: d.category,
    amountCents: d.amountCents,
  });
}

function toRole(d: Domain, p: Play): WalletRole | null {
  const leg = p.legs[0];
  if (!leg) return null;
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
  const everydayPlays = runDomain(input, everydayDomain);
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
  const everydayRole = toRole(everydayDomain, everydayPlay);
  if (!everydayRole) return [];

  const roles: WalletRole[] = [everydayRole];

  // 2. Specialist domains — assigned only when the winner is a different card
  //    AND the domain value beats the everyday value by more than rounding.
  for (const d of DOMAINS.slice(1)) {
    const plays = runDomain(input, d);
    const winner = plays[0];
    if (!winner) continue;
    const role = toRole(d, winner);
    if (!role) continue;
    if (role.userCardId === everydayRole.userCardId) continue;
    if (!beatsEveryday(role.valueCents, everydayRole.valueCents)) continue;
    roles.push(role);
  }

  return roles;
}
