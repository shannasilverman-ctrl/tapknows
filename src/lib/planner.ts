import type { CardCatalog, EarnRule, PointsProgram, UserCard, UserOffer } from "./types";
import { dollars } from "./format";
import { benefitMatches, type CardBenefit } from "./benefits";

export type BenefitApplied = {
  benefit_id: string;
  card_catalog_id: string;
  label: string;
  applied_cents: number;
  ends_at: string; // ISO
  cadence: CardBenefit["cadence"];
};

export type PlayLeg = {
  userCardId: string;
  card: CardCatalog;
  nickname: string | null;
  amountCents: number;
  earnMultiplier: number; // for display (2 = 2x, or 0.03 for 3% cashback)
  matchedCategory: string;
  valueCents: number; // rewards + credit combined
  rewardsCents: number; // rewards only, for honest reason line
  benefitApplied?: BenefitApplied;
  reasoning: string;
  offerApplied?: UserOffer;
  rewardKind: "points" | "cashback" | "credit";
  pointsEarned: number;
  cpp: number;
  programId: string | null;
};

export type Play = {
  id: string;
  kind: "single" | "split";
  legs: PlayLeg[];
  totalValueCents: number;
  headline: string;
  programIdsUsed: string[]; // for assumption notes
};

export type PlannerBenefitContext = {
  benefit: CardBenefit;
  remaining_cents: number;
  ends_at: Date;
};

export type PlannerInput = {
  userCards: UserCard[];
  catalog: Record<string, CardCatalog>;
  programs: Record<string, PointsProgram>;
  offers: UserOffer[]; // pre-filtered to this merchant
  cppOverrides: Record<string, number>;
  merchantCategory: string;
  amountCents: number;
  foreign?: boolean;
  merchant?: { id?: string | null; name?: string | null } | null;
  benefitsByCard?: Record<string, PlannerBenefitContext[]>; // key: card_catalog_id
};

function cppFor(
  programId: string | null,
  programs: Record<string, PointsProgram>,
  overrides: Record<string, number>,
) {
  if (!programId) return 1.0;
  if (overrides[programId] != null) return overrides[programId];
  return programs[programId]?.default_cpp ?? 0.01;
}

function programKind(
  programId: string | null,
  programs: Record<string, PointsProgram>,
): "cashback" | "points" {
  if (!programId) return "cashback";
  const p = programs[programId];
  return p?.kind === "cashback" ? "cashback" : "points";
}

function pickRule(rules: EarnRule[], category: string): EarnRule {
  const direct = rules.find((r) => r.category === category);
  if (direct) return direct;
  // A merchant-specific slug may have a bespoke issuer rule while still
  // belonging to a broad category for the rest of the wallet.
  const broaderCategory = category === "whole_foods" ? "groceries" : null;
  if (broaderCategory) {
    const broader = rules.find((r) => r.category === broaderCategory);
    if (broader) return broader;
  }
  // Base rate can be encoded as either "all" (test fixtures / legacy) or
  // "everything_else" (the real catalog). Fall through to either.
  const base =
    rules.find((r) => r.category === "all") ?? rules.find((r) => r.category === "everything_else");
  return base ?? { category: "all", multiplier: 1 };
}

function evalCard(
  uc: UserCard,
  amountCents: number,
  category: string,
  ctx: PlannerInput,
):
  | (Omit<PlayLeg, "amountCents" | "valueCents" | "reasoning"> & {
      valueCents: number;
      reasoning: string;
    })
  | null {
  const card = ctx.catalog[uc.card_catalog_id];
  if (!card) return null;
  const amountDollars = amountCents / 100;
  const rule = pickRule(card.earn_rules, category);
  const kind = programKind(card.points_program_id, ctx.programs);
  const cpp = cppFor(card.points_program_id, ctx.programs, ctx.cppOverrides);
  const multiplier = rule.multiplier;

  let valueCents: number;
  let pointsEarned = 0;
  if (kind === "cashback") {
    valueCents = Math.round(amountDollars * multiplier * 100);
  } else {
    pointsEarned = Math.round(amountDollars * multiplier);
    valueCents = Math.round(pointsEarned * cpp * 100);
  }

  // Foreign penalty
  if (ctx.foreign && card.foreign_tx_fee_pct > 0) {
    valueCents -= Math.round(amountDollars * Number(card.foreign_tx_fee_pct) * 100);
  }

  const matchedCategory = rule.category === "all" ? "everything" : rule.category.replace(/_/g, " ");
  const reasoning =
    kind === "cashback"
      ? `${(multiplier * 100).toFixed(multiplier < 0.1 ? 0 : 0)}% back on ${matchedCategory}`
      : `${multiplier}x on ${matchedCategory}`;

  return {
    userCardId: uc.id,
    card,
    nickname: uc.nickname,
    earnMultiplier: multiplier,
    matchedCategory,
    valueCents,
    rewardsCents: valueCents,
    reasoning,
    rewardKind: kind === "cashback" ? "cashback" : "points",
    pointsEarned,
    cpp,
    programId: card.points_program_id,
  };
}

function offerValueOnLeg(
  offer: UserOffer,
  amountCents: number,
  cpp: number,
  kind: "cashback" | "points",
): { valueCents: number; kindOverride: "points" | "cashback" | "credit"; reasoning: string } {
  const amountDollars = amountCents / 100;
  if (offer.reward_type === "statement_credit") {
    return {
      valueCents: Math.round(Number(offer.reward_value) * 100),
      kindOverride: "credit",
      reasoning: `unlocks $${Number(offer.reward_value).toFixed(0)} credit at ${offer.merchant_text}`,
    };
  }
  if (offer.reward_type === "percent_back") {
    // reward_value is a percentage (e.g. 5 = 5%). Convert to cents:
    // amountCents * (pct/100) = amountCents * pct / 100.
    return {
      valueCents: Math.round((amountCents * Number(offer.reward_value)) / 100),
      kindOverride: "cashback",
      reasoning: `${offer.reward_value}% offer at ${offer.merchant_text}`,
    };
  }
  // multiplier
  const m = Number(offer.reward_value);
  if (kind === "cashback") {
    return {
      valueCents: Math.round(amountDollars * m * 100),
      kindOverride: "cashback",
      reasoning: `${m}x offer at ${offer.merchant_text}`,
    };
  }
  const pts = Math.round(amountDollars * m);
  return {
    valueCents: Math.round(pts * cpp * 100),
    kindOverride: "points",
    reasoning: `${m}x offer at ${offer.merchant_text}`,
  };
}

function evalCardWithOffer(
  uc: UserCard,
  amountCents: number,
  category: string,
  offer: UserOffer,
  ctx: PlannerInput,
): PlayLeg | null {
  const card = ctx.catalog[uc.card_catalog_id];
  if (!card) return null;
  const base = evalCard(uc, amountCents, category, ctx);
  if (!base) return null;
  const cpp = base.cpp;
  const kind = base.rewardKind === "cashback" ? "cashback" : "points";
  const off = offerValueOnLeg(offer, amountCents, cpp, kind);
  // Use max of (base earn + offer overlay) — statement credits stack with base earn,
  // percent_back replaces base for simplicity, multiplier replaces base multiplier.
  let combinedValue: number;
  let reasoning: string;
  if (offer.reward_type === "statement_credit") {
    combinedValue = base.valueCents + off.valueCents;
    reasoning = `${base.reasoning} + ${off.reasoning}`;
  } else {
    combinedValue = Math.max(base.valueCents, off.valueCents);
    reasoning = off.reasoning;
  }
  return {
    ...base,
    amountCents,
    valueCents: combinedValue,
    reasoning,
    offerApplied: offer,
    rewardKind: off.kindOverride,
  };
}

function displayLabel(card: CardCatalog, nickname: string | null) {
  return nickname ?? `${card.issuer} ${card.name}`;
}

// Find the best matching redeemable benefit for a leg's card + this decide.
// Cap = min(remaining_cents_this_period, purchase amount). Returns null when
// no benefit matches or nothing is redeemable.
function pickBenefitForLeg(leg: PlayLeg, ctx: PlannerInput): BenefitApplied | null {
  const list = ctx.benefitsByCard?.[leg.card.id];
  if (!list?.length) return null;
  const merchant = ctx.merchant ?? null;
  let best: { ctx: PlannerBenefitContext; applied: number } | null = null;
  for (const bctx of list) {
    if (bctx.remaining_cents <= 0) continue;
    if (bctx.benefit.value_cents == null) continue;
    if (!benefitMatches(bctx.benefit, merchant, ctx.merchantCategory)) continue;
    const applied = Math.min(bctx.remaining_cents, leg.amountCents);
    if (applied <= 0) continue;
    if (!best || applied > best.applied) best = { ctx: bctx, applied };
  }
  if (!best) return null;
  return {
    benefit_id: best.ctx.benefit.id,
    card_catalog_id: best.ctx.benefit.card_catalog_id,
    label: best.ctx.benefit.label,
    applied_cents: best.applied,
    ends_at: best.ctx.ends_at.toISOString(),
    cadence: best.ctx.benefit.cadence,
  };
}

function shortDeadline(ends_at: string): string {
  const d = new Date(ends_at);
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${d.getUTCDate()}`;
}

// Layer a matched benefit onto a leg: add credit to value, compose reason line
// naming rewards + credit separately per the honesty rule.
function withBenefit(leg: PlayLeg, ctx: PlannerInput): PlayLeg {
  const applied = pickBenefitForLeg(leg, ctx);
  if (!applied) return leg;
  const creditDollars = `$${(applied.applied_cents / 100).toFixed(applied.applied_cents % 100 === 0 ? 0 : 2)}`;
  const label = applied.label.replace(/^\$\d+\s*(monthly|quarterly|annual|semiannual)?\s*/i, "");
  return {
    ...leg,
    valueCents: leg.valueCents + applied.applied_cents,
    benefitApplied: applied,
    reasoning: `${leg.reasoning} plus your ${creditDollars} ${label.trim() || "credit"}, resets ${shortDeadline(applied.ends_at)}`,
  };
}

function singleHeadline(leg: PlayLeg) {
  const label = displayLabel(leg.card, leg.nickname);
  const amount = dollars(leg.amountCents);
  return `Put ${amount} on ${label} for ${leg.reasoning}.`;
}

function splitHeadline(a: PlayLeg, b: PlayLeg) {
  return `Put ${dollars(a.amountCents)} on ${displayLabel(a.card, a.nickname)} to ${a.offerApplied ? "unlock the offer" : a.reasoning}, put ${dollars(b.amountCents)} on ${displayLabel(b.card, b.nickname)} for ${b.reasoning}.`;
}

export function planPurchase(input: PlannerInput): Play[] {
  const { userCards, offers, amountCents, merchantCategory } = input;
  const plays: Play[] = [];
  if (amountCents <= 0 || userCards.length === 0) return plays;

  // 1. Single-card plays (with or without offer)
  for (const uc of userCards) {
    const offer = offers.find((o) => o.user_card_id === uc.id);
    let leg: PlayLeg | null;
    if (offer && offer.min_spend * 100 <= amountCents) {
      leg = evalCardWithOffer(uc, amountCents, merchantCategory, offer, input);
    } else {
      const base = evalCard(uc, amountCents, merchantCategory, input);
      if (!base) continue;
      leg = { ...base, amountCents };
    }
    if (!leg) continue;
    leg = withBenefit(leg, input);
    plays.push({
      id: `single_${uc.id}`,
      kind: "single",
      legs: [leg],
      totalValueCents: leg.valueCents,
      headline: singleHeadline(leg),
      programIdsUsed: leg.programId ? [leg.programId] : [],
    });
  }

  // 2. Split plays: for every offer with a min_spend that fits, split the charge
  for (const offer of offers) {
    const ucA = userCards.find((c) => c.id === offer.user_card_id);
    if (!ucA) continue;
    const minCents = offer.min_spend * 100;
    if (minCents <= 0 || minCents >= amountCents) continue;

    // Portion A: exactly the min_spend (unlocks the offer)
    const legA = evalCardWithOffer(ucA, minCents, merchantCategory, offer, input);
    if (!legA) continue;

    // Portion B: rest, best remaining card
    const restCents = amountCents - minCents;
    let bestB: PlayLeg | null = null;
    for (const ucB of userCards) {
      if (ucB.id === ucA.id) continue; // must be a different card for a "split"
      const base = evalCard(ucB, restCents, merchantCategory, input);
      if (!base) continue;
      const leg: PlayLeg = { ...base, amountCents: restCents };
      if (!bestB || leg.valueCents > bestB.valueCents) bestB = leg;
    }
    if (!bestB) continue;

    const total = legA.valueCents + bestB.valueCents;
    plays.push({
      id: `split_${offer.id}`,
      kind: "split",
      legs: [legA, bestB],
      totalValueCents: total,
      headline: splitHeadline(legA, bestB),
      programIdsUsed: Array.from(
        new Set([legA.programId, bestB.programId].filter((x): x is string => !!x)),
      ),
    });
  }

  plays.sort((a, b) => b.totalValueCents - a.totalValueCents);
  return plays;
}

export type MathRow = {
  playId: string;
  label: string;
  kind: "single" | "split";
  earnDescription: string;
  offerDescription: string;
  redemptionDescription: string;
  netValueCents: number;
};

export function buildMathRows(
  plays: Play[],
  programs: Record<string, PointsProgram>,
  cppOverrides: Record<string, number>,
): MathRow[] {
  return plays.map((p) => {
    const legLabels = p.legs.map((l) => displayLabel(l.card, l.nickname));
    const label = p.kind === "split" ? legLabels.join(" + ") : legLabels[0];
    const earn = p.legs
      .map((l) =>
        l.rewardKind === "cashback"
          ? `${dollars(l.amountCents)} × ${(l.earnMultiplier * 100).toFixed(0)}%`
          : `${dollars(l.amountCents)} × ${l.earnMultiplier}x`,
      )
      .join(" · ");
    const offer =
      p.legs
        .filter((l) => l.offerApplied)
        .map((l) => l.offerApplied!.merchant_text)
        .join(" + ") || "—";
    const redemption =
      p.programIdsUsed
        .map((pid) => {
          const prog = programs[pid];
          if (!prog || prog.kind === "cashback") return null;
          const cpp = cppOverrides[pid] ?? prog.default_cpp;
          return `${prog.name} @ ${(cpp * 100).toFixed(2)}¢`;
        })
        .filter(Boolean)
        .join(", ") || "cash";
    return {
      playId: p.id,
      label,
      kind: p.kind,
      earnDescription: earn,
      offerDescription: offer,
      redemptionDescription: redemption,
      netValueCents: p.totalValueCents,
    };
  });
}
