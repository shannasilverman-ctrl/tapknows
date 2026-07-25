import type {
  CardCatalog,
  EarnRule,
  PointsProgram,
  Recommendation,
  UserCard,
  UserOffer,
} from "./types";

export type RecommenderInput = {
  userCards: UserCard[];
  catalog: Record<string, CardCatalog>;
  programs: Record<string, PointsProgram>;
  offers: UserOffer[];
  cppOverrides: Record<string, number>; // programId -> cpp
  merchantCategory: string;
  amountCents: number; // 0 = unknown
  foreign?: boolean;
};

function pickBestRule(rules: EarnRule[], category: string): EarnRule | null {
  // Look for a direct match first, then fall back to "all"
  const direct = rules.find((r) => r.category === category);
  if (direct) return direct;
  const base = rules.find((r) => r.category === "all");
  return base ?? null;
}

function cppFor(
  programId: string | null,
  programs: Record<string, PointsProgram>,
  overrides: Record<string, number>,
): number {
  if (!programId) return 1.0;
  if (overrides[programId] != null) return overrides[programId];
  return programs[programId]?.default_cpp ?? 1.0;
}

function programKind(programId: string | null, programs: Record<string, PointsProgram>) {
  if (!programId) return "points";
  const p = programs[programId];
  if (!p) return "points";
  if (p.kind === "cashback") return "cashback";
  return "points";
}

function describeReasoning(opts: {
  cardName: string;
  multiplier: number;
  matchedCategory: string;
  pointsEarned: number;
  valueCents: number;
  programName: string;
  offer?: UserOffer;
  rewardKind: "points" | "cashback" | "credit";
}): string {
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  if (opts.offer) {
    if (opts.offer.reward_type === "percent_back") {
      return `Active offer: ${opts.offer.reward_value}% back at ${opts.offer.merchant_text} — ${dollars(opts.valueCents)} back`;
    }
    if (opts.offer.reward_type === "statement_credit") {
      return `Active offer: $${opts.offer.reward_value} statement credit at ${opts.offer.merchant_text}`;
    }
  }
  if (opts.rewardKind === "cashback") {
    return `${opts.multiplier}% back on ${opts.matchedCategory} — ${dollars(opts.valueCents)} back`;
  }
  return `${opts.multiplier}x on ${opts.matchedCategory} — ${opts.pointsEarned.toLocaleString()} ${opts.programName} pts ≈ ${dollars(opts.valueCents)}`;
}

export function recommend(input: RecommenderInput): Recommendation[] {
  const {
    userCards,
    catalog,
    programs,
    offers,
    cppOverrides,
    merchantCategory,
    amountCents,
    foreign,
  } = input;
  const amountDollars = amountCents / 100;
  const assumeDollars = amountDollars > 0 ? amountDollars : 100; // fallback for ranking

  const results: Recommendation[] = [];

  for (const uc of userCards) {
    const card = catalog[uc.card_catalog_id];
    if (!card) continue;

    // Find a matching active offer for THIS user card at THIS merchant
    const matchedOffer = offers.find((o) =>
      o.user_card_id === uc.id && (o.merchant_catalog_id != null) === false
        ? false // skip if no merchant match below
        : true,
    );
    // Better matching: offer applies if merchant_catalog_id matches the merchant id (passed via category for V1 we pass the merchant id too — see RecommenderInput extension below)
    // For simplicity in V1, offers match purely on merchant_catalog_id stored as the same id we'd pass — we'll let the caller filter offers by merchant before passing them in.

    const cpp = cppFor(card.points_program_id, programs, cppOverrides);
    const program = card.points_program_id ? programs[card.points_program_id] : null;
    const programName = program?.name ?? "points";
    const kind = programKind(card.points_program_id, programs);

    let multiplier = 1;
    let matchedCategory = "base";
    let valueCents = 0;
    let pointsEarned = 0;
    let rewardKind: "points" | "cashback" | "credit" = kind === "cashback" ? "cashback" : "points";
    let offerApplied: UserOffer | undefined;

    // Apply offer if one matches THIS card
    const offer = offers.find((o) => o.user_card_id === uc.id);
    if (offer) {
      offerApplied = offer;
      if (offer.reward_type === "multiplier") {
        multiplier = Number(offer.reward_value);
        matchedCategory = offer.merchant_text;
        if (kind === "cashback") {
          valueCents = Math.round(assumeDollars * multiplier);
        } else {
          pointsEarned = Math.round(assumeDollars * multiplier);
          valueCents = Math.round(pointsEarned * cpp);
        }
      } else if (offer.reward_type === "percent_back") {
        rewardKind = "cashback";
        valueCents = Math.round(assumeDollars * Number(offer.reward_value));
        multiplier = Number(offer.reward_value);
        matchedCategory = offer.merchant_text;
      } else if (offer.reward_type === "statement_credit") {
        rewardKind = "credit";
        valueCents = Math.round(Number(offer.reward_value) * 100);
        multiplier = 0;
        matchedCategory = offer.merchant_text;
      }
    } else {
      const rule = pickBestRule(card.earn_rules, merchantCategory);
      if (!rule) continue;
      multiplier = rule.multiplier;
      matchedCategory = rule.category === "all" ? "all spend" : rule.category.replace(/_/g, " ");
      if (kind === "cashback") {
        valueCents = Math.round(assumeDollars * multiplier);
      } else {
        pointsEarned = Math.round(assumeDollars * multiplier);
        valueCents = Math.round(pointsEarned * cpp);
      }
    }

    // Foreign tx fee penalty
    let foreignTxPenaltyCents = 0;
    if (foreign && card.foreign_tx_fee_pct > 0) {
      foreignTxPenaltyCents = Math.round(assumeDollars * Number(card.foreign_tx_fee_pct));
      valueCents -= foreignTxPenaltyCents;
    }

    const reasoning = describeReasoning({
      cardName: card.name,
      multiplier,
      matchedCategory,
      pointsEarned,
      valueCents,
      programName,
      offer: offerApplied,
      rewardKind,
    });

    results.push({
      userCardId: uc.id,
      card,
      nickname: uc.nickname,
      multiplier,
      pointsEarned,
      cpp,
      valueCents,
      rewardKind,
      matchedCategory,
      reasoning,
      offerApplied,
      foreignTxPenaltyCents,
    });
  }

  results.sort((a, b) => b.valueCents - a.valueCents);
  return results;
}
