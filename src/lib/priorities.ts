// Onboarding priority sliders → real influence on ranking + decide-screen hints.
// Priorities are saved locally in onboarding.tsx under `tap.priorities`.
//
// Weights are 0..100:
//   points       → default ranking (highest expected value wins)
//   score        → surfaces a utilization caution on large charges
//   protections  → boosts cards with strong purchase/travel protections
//                  on charges >= $200

import type { Play } from "@/lib/planner";

export type Priorities = {
  points: number;
  score: number;
  protections: number;
};

export const DEFAULT_PRIORITIES: Priorities = {
  points: 60,
  score: 30,
  protections: 40,
};

// Curated set of catalog IDs that carry strong purchase + travel protections.
// Source: public issuer benefit guides. Kept intentionally conservative — only
// cards with published extended warranty AND purchase protection AND, for the
// premium tier, meaningful travel coverage.
export const STRONG_PROTECTION_CARDS = new Set<string>([
  "chase_csr",
  "chase_csp",
  "chase_united_explorer",
  "chase_world_of_hyatt",
  "amex_platinum",
  "amex_gold",
  "amex_delta_gold",
  "citi_premier",
  "citi_double_cash",
  "capital_one_venture_x",
]);

export function loadPriorities(): Priorities {
  if (typeof window === "undefined") return DEFAULT_PRIORITIES;
  try {
    const raw = window.localStorage.getItem("tap.priorities");
    if (!raw) return DEFAULT_PRIORITIES;
    const p = JSON.parse(raw) as Partial<Priorities>;
    return {
      points: clamp(p.points ?? DEFAULT_PRIORITIES.points),
      score: clamp(p.score ?? DEFAULT_PRIORITIES.score),
      protections: clamp(p.protections ?? DEFAULT_PRIORITIES.protections),
    };
  } catch {
    return DEFAULT_PRIORITIES;
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export type PriorityApplied = {
  plays: Play[];
  reason: string | null;
  utilizationCaution: string | null;
};

/**
 * Rerank plays based on user priorities. Points weight is the default rank.
 * If protections weight is high enough AND the charge is >= $200, we promote
 * the highest-value play that uses a protection card to #1 (if it isn't
 * already), and expose a short reason line for the UI.
 */
export function applyPriorities(
  plays: Play[],
  ctx: { amountCents: number },
  prio: Priorities = loadPriorities(),
): PriorityApplied {
  if (plays.length === 0) {
    return { plays, reason: null, utilizationCaution: null };
  }

  let reason: string | null = null;
  let out = plays;

  const bigCharge = ctx.amountCents >= 20000;

  // Protections rerank
  if (prio.protections >= 60 && bigCharge) {
    const idx = out.findIndex((p) => p.legs.some((l) => STRONG_PROTECTION_CARDS.has(l.card.id)));
    if (idx > 0) {
      const [pick] = out.splice(idx, 1);
      out = [pick, ...out];
      reason = "Ranked with your protection priority.";
    } else if (idx === 0) {
      reason = "This card also carries strong purchase protections.";
    }
  }

  // Utilization caution
  let utilizationCaution: string | null = null;
  if (prio.score >= 60 && ctx.amountCents >= 30000) {
    utilizationCaution =
      "Heads up: a charge this size can push a card's utilization. Consider splitting or paying it down early.";
  }

  return { plays: out, reason, utilizationCaution };
}
