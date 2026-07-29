// Pure recommendation engine for TAP. No React/router/supabase imports.
// All monetary math done in integer cents. Points valuations passed in as cents-per-point.

export type EarnRule = {
  category: string;
  multiplier: number; // >=1 = points-per-dollar; <1 = direct cashback fraction (e.g. 0.03 = 3%)
  // Cap in dollars for the rule's period. Either the legacy `cap_annual_spend`
  // OR the newer `cap_period_spend` (+ `cap_period`) may be present. The engine
  // pro-rates a purchase that would cross the cap: capped-rate up to the
  // remaining cap, then fallback-rate on the overage.
  cap_annual_spend?: number | null;
  cap_period_spend?: number | null;
  cap_period?: "annual" | "quarterly" | "monthly";
  // Optional explicit post-cap earn rate. When omitted, the engine falls back
  // to the card's everything_else / all base rule (existing behavior).
  post_cap_multiplier?: number | null;
  note?: string;
};

// Merchant-specific categories can carry an issuer-specific earn rule while
// still belonging to a broader spend category for every other card. Exact
// rules always win; aliases are only consulted when a card has no exact rule.
const CATEGORY_FALLBACKS: Record<string, string> = {
  whole_foods: "groceries",
};

export type EngineCard = {
  id: string; // stable user-card id (uuid for authed users, guest_* for local)
  card_catalog_id: string;
  nickname?: string | null;
  issuer: string;
  name: string;
  points_program_id: string | null;
  foreign_tx_fee_pct: number;
  earn_rules: EarnRule[];
};

export type OfferType =
  | "dollars_off_threshold"
  | "percent_back"
  | "bonus_points"
  | "multiplier"
  | "statement_credit";

export type EngineOffer = {
  id: string;
  user_card_id: string;
  merchant?: string | null; // free-text merchant match
  offer_type: OfferType;
  discount_amount: number; // dollars (dollars_off / statement_credit / bonus_points as pts-per-$), percent (percent_back), or multiplier x
  spend_threshold?: number | null; // dollars
  max_benefit?: number | null; // dollars cap on the offer value
  expires_on?: string | null; // ISO date; expired offers are excluded
  is_used?: boolean;
};

export type EngineInput = {
  amountCents: number;
  category: string; // canonical category from merchant or user pick
  merchant?: string | null;
  foreign?: boolean;
  wallet: EngineCard[];
  offers: EngineOffer[];
  valuations: Record<string, number>; // points_program_id -> cents per point
  categorySpendYtdByCard?: Record<string, number>; // dollars YTD for the current category, per user card id
  // Per-user-card set of category slugs the user has flagged as "bonus cap
  // reached" for the current cap period. When set, the engine scores that rule
  // at its post-cap rate for the WHOLE purchase (no pro-rate). This gives
  // power users cap correctness before Plaid spend data lands.
  capReachedCategoriesByCard?: Record<string, string[]>;
  now?: Date;
};

export type PlayLeg = {
  userCardId: string;
  cardLabel: string;
  amountCents: number;
  baseEarnCents: number;
  offerValueCents: number;
  rewardKind?: "points" | "cashback";
  pointsEarned?: number;
  cppCents?: number;
  programId?: string | null;
  reason: string;
  // Honest cap disclosure for rules with a period cap. Present only when the
  // winning rule for this leg is capped. UI may render inline; also appended
  // to `reason`.
  capNote?: string;
};

export type Play = {
  kind: "single" | "split";
  legs: PlayLeg[];
  totalValueCents: number;
  headline: string;
};

export type MathRow = {
  playKind: "single" | "split";
  label: string;
  baseEarnCents: number;
  offerValueCents: number;
  totalCents: number;
  assumption: string;
};

export type EngineOutput = {
  winner: Play | null;
  runnerUp: Play | null;
  // Complete deterministic ranking. Utilization and other customer preferences
  // must be able to choose a compliant third card, not just swap the top two.
  rankedPlays?: Play[];
  dollarDeltaCents: number; // winner - (runnerUp OR best single-card play), whichever exists
  explanation: string;
  mathTable: MathRow[];
  emptyWalletGuidance?: string;
};

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function labelCard(c: EngineCard): string {
  return c.nickname && c.nickname.trim().length > 0 ? c.nickname : `${c.issuer} ${c.name}`;
}

function offerActive(o: EngineOffer, now: Date): boolean {
  if (o.is_used) return false;
  if (o.expires_on) {
    // A date-only consumer offer remains usable through the end of that date.
    // Timestamped expirations retain their exact instant.
    const exp = /^\d{4}-\d{2}-\d{2}$/.test(o.expires_on)
      ? new Date(`${o.expires_on}T23:59:59.999`)
      : new Date(o.expires_on);
    if (Number.isFinite(exp.getTime()) && exp.getTime() < now.getTime()) return false;
  }
  return true;
}

function ruleCap(rule: EarnRule): number | null {
  if (rule.cap_period_spend != null) return rule.cap_period_spend;
  if (rule.cap_annual_spend != null) return rule.cap_annual_spend;
  return null;
}

function findFallback(rules: EarnRule[]): EarnRule {
  return (
    rules.find((r) => r.category === "everything_else") ??
    rules.find((r) => r.category === "all") ?? {
      category: "everything_else",
      multiplier: 1,
    }
  );
}

function findMatchingRule(rules: EarnRule[], category: string): EarnRule | null {
  const direct = rules.find((r) => r.category === category);
  if (direct) return direct;
  const broaderCategory = CATEGORY_FALLBACKS[category];
  if (broaderCategory) {
    const broader = rules.find((r) => r.category === broaderCategory);
    if (broader) return broader;
  }
  // Rotating, top-spend, and user-choice rules are not universal. Until the
  // customer explicitly selects/activates a category, scoring them as active
  // would invent rewards. Safely fall back instead.
  return null;
}

/** Resolve the earn rule the engine applies to a card for a purchase category. */
export function resolveEarnRule(card: EngineCard, category: string): EarnRule {
  return findMatchingRule(card.earn_rules, category) ?? findFallback(card.earn_rules);
}

function earnForPortion(
  card: EngineCard,
  dollarsPortion: number,
  mult: number,
  valuations: Record<string, number>,
): number {
  if (dollarsPortion <= 0) return 0;
  if (mult < 1) return Math.round(dollarsPortion * mult * 100);
  const cpp = card.points_program_id ? (valuations[card.points_program_id] ?? 1) : 1;
  return Math.round(dollarsPortion * mult * cpp);
}

function baseEarnCents(
  card: EngineCard,
  amountCents: number,
  category: string,
  valuations: Record<string, number>,
  ytdDollars: number,
  capReached = false,
): number {
  const rules = card.earn_rules;
  const fallback = findFallback(rules);
  const match = findMatchingRule(rules, category);
  const dollars = amountCents / 100;

  if (!match || match === fallback) {
    return earnForPortion(card, dollars, fallback.multiplier, valuations);
  }

  const postCap =
    match.post_cap_multiplier != null ? match.post_cap_multiplier : fallback.multiplier;

  // User has flagged this rule's bonus as exhausted for the period.
  if (capReached) {
    return earnForPortion(card, dollars, postCap, valuations);
  }

  const cap = ruleCap(match);
  if (cap == null) {
    return earnForPortion(card, dollars, match.multiplier, valuations);
  }

  const remaining = Math.max(0, cap - ytdDollars);
  if (remaining <= 0) {
    return earnForPortion(card, dollars, postCap, valuations);
  }
  if (dollars <= remaining) {
    return earnForPortion(card, dollars, match.multiplier, valuations);
  }
  // Pro-rate: capped rate up to remaining cap, post-cap rate beyond.
  return (
    earnForPortion(card, remaining, match.multiplier, valuations) +
    earnForPortion(card, dollars - remaining, postCap, valuations)
  );
}

function formatMultiplier(m: number): string {
  return m >= 1 ? `${m}x` : `${Math.round(m * 100)}%`;
}

function periodShort(p: EarnRule["cap_period"] | undefined): string {
  switch (p) {
    case "monthly":
      return "mo";
    case "quarterly":
      return "qtr";
    case "annual":
    default:
      return "yr";
  }
}

function formatCapDollars(dollars: number): string {
  if (dollars >= 1000 && dollars % 1000 === 0) return `$${dollars / 1000}k`;
  return `$${dollars.toLocaleString("en-US")}`;
}

/** Human cap note for a rule, or null if uncapped or fallback rule. */
function capNoteForRule(card: EngineCard, category: string): string | null {
  const rules = card.earn_rules;
  const fallback = findFallback(rules);
  const match = findMatchingRule(rules, category);
  if (!match || match === fallback) return null;
  const cap = ruleCap(match);
  if (cap == null) return null;
  const postCap =
    match.post_cap_multiplier != null ? match.post_cap_multiplier : fallback.multiplier;
  const cat = match.category === category ? category : match.category;
  const catLabel = cat.replace(/_/g, " ");
  const mainRate = formatMultiplier(match.multiplier);
  const postRate = formatMultiplier(postCap);
  return `Assumes bonus cap remains: ${mainRate} on ${catLabel} (up to ${formatCapDollars(cap)}/${periodShort(match.cap_period)}, then ${postRate})`;
}

function foreignPenaltyCents(card: EngineCard, portionCents: number): number {
  // foreign_tx_fee_pct is stored as a percent (e.g. 3 = 3%), not a fraction.
  const feePct = Number(card.foreign_tx_fee_pct || 0);
  if (feePct <= 0) return 0;
  return Math.round(portionCents * (feePct / 100));
}

function offerValueCents(offer: EngineOffer, portionCents: number, cardCpp: number): number {
  const dollars = portionCents / 100;
  const thresholdDollars = offer.spend_threshold ?? 0;
  const capCents =
    offer.max_benefit != null ? Math.round(offer.max_benefit * 100) : Number.POSITIVE_INFINITY;

  switch (offer.offer_type) {
    case "dollars_off_threshold":
    case "statement_credit": {
      if (dollars < thresholdDollars) return 0;
      const raw = Math.round(offer.discount_amount * 100);
      return Math.min(raw, capCents);
    }
    case "percent_back": {
      if (dollars < thresholdDollars) return 0;
      const raw = Math.round(dollars * (offer.discount_amount / 100) * 100);
      return Math.min(raw, capCents);
    }
    case "bonus_points": {
      if (dollars < thresholdDollars) return 0;
      // discount_amount = extra points per dollar; valued at the card's own cpp
      const points = dollars * offer.discount_amount;
      const raw = Math.round(points * cardCpp);
      return Math.min(raw, capCents);
    }
    case "multiplier": {
      if (dollars < thresholdDollars) return 0;
      // discount_amount = the multiplier the offer promises (e.g. 3 = 3x).
      // Value = points at that multiplier * cpp. Callers must ensure this is only
      // used when it BEATS the card's base rule, otherwise it's a wash.
      const points = dollars * offer.discount_amount;
      const raw = Math.round(points * cardCpp);
      return Math.min(raw, capCents);
    }
    default:
      return 0;
  }
}

/**
 * Offers are non-stacking with each other. Statement credits, percent-back,
 * and bonus-points offers add to normal card earn. A multiplier describes the
 * total earn rate, so only its incremental value above the card's base earn is
 * added. This prevents a 2x card with a 5x offer from being shown as 7x.
 */
function offerIncrementCents(
  offer: EngineOffer,
  portionCents: number,
  cardCpp: number,
  baseEarnCentsBeforeFees: number,
): number {
  const value = offerValueCents(offer, portionCents, cardCpp);
  return offer.offer_type === "multiplier" ? Math.max(0, value - baseEarnCentsBeforeFees) : value;
}

function dollarStr(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return frac === 0 ? `${sign}$${whole}` : `${sign}$${whole}.${String(frac).padStart(2, "0")}`;
}

function rewardHeadline(
  kind: "points" | "cashback",
  pointsEarned: number,
  valueCents: number,
  cppCents: number,
): string {
  if (kind === "cashback") return `${dollarStr(valueCents)} cash back`;
  return `${Math.max(0, pointsEarned).toLocaleString("en-US")} points (estimated ${dollarStr(valueCents)} value at ${cppCents.toFixed(2)}¢/pt)`;
}

// --------------------------------------------------------------------------
// public API
// --------------------------------------------------------------------------

export function recommend(input: EngineInput): EngineOutput {
  const now = input.now ?? new Date();
  const { amountCents, category, wallet, foreign, merchant } = input;
  const valuations = input.valuations ?? {};

  if (wallet.length === 0) {
    return {
      winner: null,
      runnerUp: null,
      dollarDeltaCents: 0,
      explanation: "Add cards to your wallet to get exact-play recommendations.",
      mathTable: [],
      emptyWalletGuidance: "empty_wallet",
    };
  }
  if (amountCents <= 0) {
    return {
      winner: null,
      runnerUp: null,
      dollarDeltaCents: 0,
      explanation: "Enter an amount to plan.",
      mathTable: [],
    };
  }

  const activeOffers = input.offers.filter((o) => offerActive(o, now));
  // Merchant matching: if a merchant is set, offers must match by substring (either way).
  // If no merchant, only offers with no merchant scope are considered.
  const merchantLower = merchant?.toLowerCase().trim() ?? "";
  const applicableOffers = activeOffers.filter((o) => {
    const om = (o.merchant ?? "").toLowerCase().trim();
    if (!om) return !merchantLower; // untied offers apply only when user hasn't picked a merchant
    if (!merchantLower) return false;
    return om.includes(merchantLower) || merchantLower.includes(om);
  });

  const ytd = (cardId: string) => input.categorySpendYtdByCard?.[cardId] ?? 0;
  const capReachedFor = (cardId: string, cat: string) =>
    !!input.capReachedCategoriesByCard?.[cardId]?.includes(cat);
  const plays: Play[] = [];

  // ---- Single-card plays ----
  for (const card of wallet) {
    const match = findMatchingRule(card.earn_rules, category);
    const matchedCat = match?.category ?? category;
    const capReached = capReachedFor(card.id, matchedCat);
    const base = baseEarnCents(card, amountCents, category, valuations, ytd(card.id), capReached);
    const penalty = foreign ? foreignPenaltyCents(card, amountCents) : 0;
    const cpp = card.points_program_id ? (valuations[card.points_program_id] ?? 1) : 1;
    const eligibleCardOffers = applicableOffers.filter(
      (o) => o.user_card_id === card.id && (o.spend_threshold ?? 0) * 100 <= amountCents,
    );
    const bestOffer =
      eligibleCardOffers
        .map((offer) => ({
          offer,
          value: offerIncrementCents(offer, amountCents, cpp, base),
        }))
        .sort((a, b) => b.value - a.value || a.offer.id.localeCompare(b.offer.id))[0] ?? null;
    const offer = bestOffer?.offer ?? null;
    const offerVal = bestOffer?.value ?? 0;
    const total = base + offerVal - penalty;
    // Cap note only surfaces when the matched rule is capped AND still active
    // (user has not flagged it exhausted). Once flagged, the reason should
    // reflect the post-cap rate directly.
    const capNote = capReached ? null : capNoteForRule(card, category);
    const reasonBase = offer ? "base earn + offer" : "base earn";
    const reason = capNote ? `${reasonBase} · ${capNote}` : reasonBase;
    const appliedRule = resolveEarnRule(card, category);
    const rewardKind = appliedRule.multiplier < 1 ? "cashback" : "points";
    const pointsEarned = rewardKind === "points" ? Math.max(0, Math.round(base / cpp)) : 0;
    const rewardCopy = rewardHeadline(rewardKind, pointsEarned, base, cpp);
    const feeCopy = penalty > 0 ? `, less ${dollarStr(penalty)} foreign transaction fee` : "";
    const headlineBase = offer
      ? `Put ${dollarStr(amountCents)} on ${labelCard(card)} — ${rewardCopy}${feeCopy}, plus ${dollarStr(offerVal)} offer.`
      : `Put ${dollarStr(amountCents)} on ${labelCard(card)} for ${rewardCopy}${feeCopy}.`;
    plays.push({
      kind: "single",
      legs: [
        {
          userCardId: card.id,
          cardLabel: labelCard(card),
          amountCents,
          baseEarnCents: base - penalty,
          offerValueCents: offerVal,
          rewardKind,
          pointsEarned,
          cppCents: cpp,
          programId: card.points_program_id,
          reason,
          capNote: capNote ?? undefined,
        },
      ],
      totalValueCents: total,
      headline: capNote ? `${headlineBase} ${capNote}.` : headlineBase,
    });
  }

  // ---- Two-card splits (only offers with a spend_threshold below amount) ----
  for (const offer of applicableOffers) {
    const thresholdCents = Math.round((offer.spend_threshold ?? 0) * 100);
    if (thresholdCents <= 0 || thresholdCents >= amountCents) continue;

    const cardA = wallet.find((c) => c.id === offer.user_card_id);
    if (!cardA) continue;

    const portionA = thresholdCents;
    const portionB = amountCents - thresholdCents;

    const matchA = findMatchingRule(cardA.earn_rules, category);
    const capReachedA = capReachedFor(cardA.id, matchA?.category ?? category);
    const baseAGross = baseEarnCents(
      cardA,
      portionA,
      category,
      valuations,
      ytd(cardA.id),
      capReachedA,
    );
    const baseA = baseAGross - (foreign ? foreignPenaltyCents(cardA, portionA) : 0);
    const cppA = cardA.points_program_id ? (valuations[cardA.points_program_id] ?? 1) : 1;
    const offerValA = offerIncrementCents(offer, portionA, cppA, baseAGross);

    let bestB: { card: EngineCard; base: number; capReached: boolean } | null = null;
    for (const cardB of wallet) {
      if (cardB.id === cardA.id) continue;
      const matchB = findMatchingRule(cardB.earn_rules, category);
      const capReachedB = capReachedFor(cardB.id, matchB?.category ?? category);
      const baseB =
        baseEarnCents(cardB, portionB, category, valuations, ytd(cardB.id), capReachedB) -
        (foreign ? foreignPenaltyCents(cardB, portionB) : 0);
      if (!bestB || baseB > bestB.base)
        bestB = { card: cardB, base: baseB, capReached: capReachedB };
    }
    if (!bestB) continue;

    const total = baseA + offerValA + bestB.base;
    const capNoteA = capReachedA ? null : capNoteForRule(cardA, category);
    const capNoteB = bestB.capReached ? null : capNoteForRule(bestB.card, category);
    plays.push({
      kind: "split",
      legs: [
        {
          userCardId: cardA.id,
          cardLabel: labelCard(cardA),
          amountCents: portionA,
          baseEarnCents: baseA,
          offerValueCents: offerValA,
          reason: capNoteA ? `unlock offer · ${capNoteA}` : "unlock offer",
          capNote: capNoteA ?? undefined,
        },
        {
          userCardId: bestB.card.id,
          cardLabel: labelCard(bestB.card),
          amountCents: portionB,
          baseEarnCents: bestB.base,
          offerValueCents: 0,
          reason: capNoteB ? `best remaining earn · ${capNoteB}` : "best remaining earn",
          capNote: capNoteB ?? undefined,
        },
      ],
      totalValueCents: total,
      headline: `Put ${dollarStr(portionA)} on ${labelCard(cardA)} to unlock the offer, put ${dollarStr(portionB)} on ${labelCard(bestB.card)}.`,
    });
  }

  plays.sort((a, b) => b.totalValueCents - a.totalValueCents);

  const winner = plays[0] ?? null;
  const runnerUp = plays[1] ?? null;
  const bestSingle = plays.find((p) => p.kind === "single") ?? null;
  // dollarDeltaCents: winner vs the next-best play (runner-up); when winner IS a split,
  // also expose vs. best single for the "beats best single by $X" line the UI can show.
  const compareTo = runnerUp ?? bestSingle;
  const dollarDeltaCents =
    winner && compareTo && compareTo !== winner
      ? winner.totalValueCents - compareTo.totalValueCents
      : 0;

  const mathTable: MathRow[] = plays.map((p) => ({
    playKind: p.kind,
    label: p.legs.map((l) => l.cardLabel).join(" + "),
    baseEarnCents: p.legs.reduce((s, l) => s + l.baseEarnCents, 0),
    offerValueCents: p.legs.reduce((s, l) => s + l.offerValueCents, 0),
    totalCents: p.totalValueCents,
    assumption: p.kind === "split" ? "split-charge" : (p.legs[0]?.reason ?? "base earn"),
  }));

  return {
    winner,
    runnerUp,
    rankedPlays: plays,
    dollarDeltaCents,
    explanation: winner?.headline ?? "",
    mathTable,
  };
}

// Convenience: winner vs best single-card play (useful when winner IS a split).
export function deltaVsBestSingleCents(out: EngineOutput): number {
  if (!out.winner) return 0;
  const bestSingle = out.mathTable.find((r) => r.playKind === "single");
  if (!bestSingle) return 0;
  return out.winner.totalValueCents - bestSingle.totalCents;
}
