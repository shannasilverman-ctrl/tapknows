// Smart quick picks: pluggable scoring model for the home merchant bubble row.
// Inputs are additive scorers so future data sources (location, Plaid) drop in
// by pushing a new scorer into SCORERS without restructuring.

import { MERCHANTS, resolveMerchant, type MerchantEntry } from "@/lib/merchantMap";
import { rotatingBonuses } from "@/lib/rotating-categories";
import { BENEFITS_BY_CARD, currentPeriod } from "@/lib/benefits";
import { remainingCents, trackBenefitSurfaced } from "@/lib/benefitState";

const HISTORY_KEY = "tap.decideHistory";
const HISTORY_CAP = 50;

export type DecideEvent = {
  merchantId: string; // e.g. "local_starbucks"
  category: string;
  ts: number;
};

export type QuickPickInput = {
  now: Date;
  history: DecideEvent[];
  walletCatalogIds: string[];
  seededOfferMerchantIds?: string[];
  plaidTopMerchants?: { name: string; count: number }[];
  nearbyMerchantIds?: string[]; // resolved merchant.id list, nearest first
  userId?: string | null; // for reading benefit redemption state
};

export type QuickPick = {
  merchant: MerchantEntry;
  score: number;
  opportunity?: string; // reason line, if any
  nearby?: boolean;
};

type ScoreContribution = {
  merchantId: string;
  points: number;
  opportunity?: string;
  nearby?: boolean;
};

type Scorer = (input: QuickPickInput) => ScoreContribution[];

// ---------- history persistence ----------

export function getDecideHistory(): DecideEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is DecideEvent => e && typeof e.merchantId === "string" && typeof e.ts === "number",
    );
  } catch {
    return [];
  }
}

export function recordDecide(merchantId: string, category: string): void {
  if (typeof window === "undefined") return;
  if (!merchantId) return;
  const next: DecideEvent[] = [
    { merchantId, category, ts: Date.now() },
    ...getDecideHistory(),
  ].slice(0, HISTORY_CAP);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

// ---------- scorers ----------

// (a) FRECENCY — frequency weighted toward recency. Strongest signal.
const frecencyScorer: Scorer = ({ now, history }) => {
  const out: ScoreContribution[] = [];
  for (const e of history) {
    const ageDays = Math.max(0, (now.getTime() - e.ts) / 86_400_000);
    const points = 30 * Math.exp(-ageDays / 5);
    if (points > 0.5) out.push({ merchantId: e.merchantId, points });
  }
  return out;
};

// (b) TIME CONTEXT — local clock nudges the row toward what the day looks like.
type Slot = "morning" | "weekday_lunch" | "weekend_day" | "evening" | "anytime";
const SLOT_MERCHANTS: Record<Slot, string[]> = {
  morning: ["local_starbucks", "local_dunkin", "local_mcdonalds"],
  weekday_lunch: [
    "local_chipotle",
    "local_panera",
    "local_subway",
    "local_chickfila",
    "local_shake_shack",
  ],
  weekend_day: [
    "local_whole_foods",
    "local_trader_joes",
    "local_costco",
    "local_kroger",
    "local_sams_club",
  ],
  evening: [
    "local_doordash",
    "local_uber_eats",
    "local_chipotle",
    "local_dominos",
    "local_grubhub",
  ],
  anytime: [
    "local_amazon",
    "local_shell",
    "local_uber",
    "local_delta",
    "local_target",
    "local_starbucks",
    "local_chipotle",
  ],
};

function activeSlots(now: Date): Slot[] {
  const h = now.getHours();
  const day = now.getDay();
  const weekend = day === 0 || day === 6;
  const slots: Slot[] = ["anytime"];
  if (h >= 5 && h < 10) slots.push("morning");
  if (!weekend && h >= 11 && h < 14) slots.push("weekday_lunch");
  if (weekend && h >= 9 && h < 17) slots.push("weekend_day");
  if (h >= 17 && h < 22) slots.push("evening");
  return slots;
}

const timeScorer: Scorer = ({ now }) => {
  const out: ScoreContribution[] = [];
  for (const slot of activeSlots(now)) {
    const points = slot === "anytime" ? 3 : 10;
    for (const merchantId of SLOT_MERCHANTS[slot]) {
      out.push({ merchantId, points });
    }
  }
  return out;
};

// (c) STRATEGIC OPPORTUNITY — a merchant where the user's current wallet has
// an edge: a live rotating 5% match, or an active seeded offer.
const BONUS_MERCHANTS: Record<string, { merchantId: string; reason: string }[]> = {
  chase_freedom_flex: [
    { merchantId: "local_shell", reason: "Freedom Flex is 5% on gas until Sep 30." },
    { merchantId: "local_uber", reason: "Freedom Flex is 5% on transit until Sep 30." },
    { merchantId: "local_amc", reason: "Freedom Flex is 5% on live entertainment until Sep 30." },
  ],
  discover_it_cash_back: [
    { merchantId: "local_delta", reason: "Discover it earns 5% on airlines until Sep 30." },
    { merchantId: "local_uber", reason: "Discover it earns 5% on transportation until Sep 30." },
  ],
};

const opportunityScorer: Scorer = ({ walletCatalogIds, seededOfferMerchantIds }) => {
  const out: ScoreContribution[] = [];
  const owned = new Set(walletCatalogIds);
  for (const bonus of rotatingBonuses()) {
    if (!owned.has(bonus.card_catalog_id)) continue;
    const picks = BONUS_MERCHANTS[bonus.card_catalog_id];
    if (!picks) continue;
    for (const p of picks) {
      out.push({ merchantId: p.merchantId, points: 18, opportunity: p.reason });
    }
  }
  for (const mid of seededOfferMerchantIds ?? []) {
    out.push({
      merchantId: mid,
      points: 14,
      opportunity: "You have a targeted offer on this merchant.",
    });
  }
  return out;
};

// (d) PLAID TOP MERCHANTS — learned from linked bank transactions.
const plaidScorer: Scorer = ({ plaidTopMerchants }) => {
  const out: ScoreContribution[] = [];
  if (!plaidTopMerchants?.length) return out;
  const max = plaidTopMerchants[0]?.count ?? 1;
  for (const p of plaidTopMerchants) {
    const m = resolveMerchant(p.name);
    if (!m) continue;
    // Normalize: top merchant ~ 20 points, tapering with count share.
    const points = 20 * (p.count / max);
    if (points > 0.5) out.push({ merchantId: m.id, points });
  }
  return out;
};

// (e) NEARBY — foreground location grant reranks with a modest boost.
const nearbyScorer: Scorer = ({ nearbyMerchantIds }) => {
  const out: ScoreContribution[] = [];
  if (!nearbyMerchantIds?.length) return out;
  const n = nearbyMerchantIds.length;
  nearbyMerchantIds.forEach((id, idx) => {
    // Nearest ~ 22 points, tapering.
    const points = 22 * (1 - idx / Math.max(n, 1));
    out.push({ merchantId: id, points, nearby: true });
  });
  return out;
};

// (f) BENEFITS — an unredeemed credit with value remaining raises its merchants.
// Weight lifts as the period end approaches so a near-deadline credit is louder.
const benefitScorer: Scorer = ({ walletCatalogIds, userId, now }) => {
  const out: ScoreContribution[] = [];
  const owned = new Set(walletCatalogIds);
  for (const cid of owned) {
    const list = BENEFITS_BY_CARD[cid] ?? [];
    for (const b of list) {
      if (b.kind !== "redeemable" || b.value_cents == null) continue;
      const remaining = remainingCents(userId ?? null, b, now);
      if (remaining <= 0) continue;
      const { endsAt } = currentPeriod(b.cadence, now);
      const daysLeft = Math.max(1, Math.round((endsAt.getTime() - now.getTime()) / 86_400_000));
      // Base ~18, doubles as period end nears.
      const urgency = daysLeft <= 3 ? 2 : daysLeft <= 10 ? 1.5 : 1;
      const points = 18 * urgency;
      const dollars = `$${(remaining / 100).toFixed(remaining % 100 === 0 ? 0 : 2)}`;
      const shortLabel = b.label
        .replace(/^\$\d+\s*(monthly|quarterly|annual|semiannual)?\s*/i, "")
        .trim();
      const reason = `${dollars} of your ${shortLabel || "credit"} unused this period.`;
      // Fan out to every merchant listed on the benefit that resolves to our map.
      let emitted = false;
      for (const token of b.merchants ?? []) {
        const t = token.toLowerCase();
        const merchant = t.startsWith("local_")
          ? MERCHANTS.find((m) => m.id === t)
          : resolveMerchant(token);
        if (!merchant) continue;
        out.push({ merchantId: merchant.id, points, opportunity: reason });
        emitted = true;
      }
      if (emitted) {
        trackBenefitSurfaced("opportunity_pick", { id: b.id, card_catalog_id: b.card_catalog_id });
      }
    }
  }
  return out;
};

// Pluggable list — new scorers append here.
const SCORERS: Scorer[] = [
  frecencyScorer,
  timeScorer,
  opportunityScorer,
  benefitScorer,
  plaidScorer,
  nearbyScorer,
];

// ---------- composition ----------

const MERCHANT_BY_ID = new Map(MERCHANTS.map((m) => [m.id, m]));

export function computeQuickPicks(input: QuickPickInput, limit = 5): QuickPick[] {
  const totals = new Map<string, { points: number; opportunity?: string; nearby?: boolean }>();
  for (const scorer of SCORERS) {
    for (const c of scorer(input)) {
      const existing = totals.get(c.merchantId) ?? { points: 0 };
      existing.points += c.points;
      if (c.opportunity && !existing.opportunity) existing.opportunity = c.opportunity;
      if (c.nearby) existing.nearby = true;
      totals.set(c.merchantId, existing);
    }
  }

  const ranked: QuickPick[] = [];
  for (const [id, v] of totals) {
    const merchant = MERCHANT_BY_ID.get(id);
    if (!merchant) continue;
    ranked.push({
      merchant,
      score: v.points,
      opportunity: v.opportunity,
      nearby: v.nearby,
    });
  }
  ranked.sort((a, b) => b.score - a.score);

  const picked: QuickPick[] = [];
  const perCat = new Map<string, number>();
  const push = (p: QuickPick) => {
    const count = perCat.get(p.merchant.category) ?? 0;
    if (count >= 2) return false;
    picked.push(p);
    perCat.set(p.merchant.category, count + 1);
    return true;
  };

  for (const p of ranked) {
    if (picked.length >= limit) break;
    if (picked.some((x) => x.merchant.id === p.merchant.id)) continue;
    push(p);
  }

  const hasOpp = picked.some((p) => p.opportunity);
  if (!hasOpp) {
    const firstOpp = ranked.find((p) => p.opportunity);
    if (firstOpp && !picked.some((x) => x.merchant.id === firstOpp.merchant.id)) {
      const removed = picked.pop();
      if (removed) {
        const c = perCat.get(removed.merchant.category) ?? 1;
        perCat.set(removed.merchant.category, Math.max(0, c - 1));
      }
      picked.push(firstOpp);
    }
  }

  return picked.slice(0, limit);
}
