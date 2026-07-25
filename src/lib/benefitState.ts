// Local-first benefit redemption state.
// Keyed per user (or "guest") so signing in doesn't leak state across sessions.
// When authed, redemptions mirror to user_benefit_redemptions for cross-device
// continuity; local writes are authoritative for the current session and are
// reconciled with the server on next load (max wins).

import { BENEFITS_BY_CARD, currentPeriod, previousPeriodKey, type CardBenefit } from "./benefits";

const KEY_PREFIX = "tap.benefits.v1.";
const EXPIRED_PREFIX = "tap.benefits.expired.v1.";

type RedemptionRecord = {
  redeemed_cents: number;
  redeemed_at: string;
};

type Bag = Record<string, RedemptionRecord>;

function ownerKey(userId: string | null): string {
  return `${KEY_PREFIX}${userId ?? "guest"}`;
}

function read(userId: string | null): Bag {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ownerKey(userId));
    if (!raw) return {};
    return JSON.parse(raw) as Bag;
  } catch {
    return {};
  }
}

function write(userId: string | null, bag: Bag) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ownerKey(userId), JSON.stringify(bag));
    window.dispatchEvent(new Event("tap:benefits"));
  } catch {}
}

function bagKey(catalogId: string, benefitId: string, periodKey: string) {
  return `${catalogId}::${benefitId}::${periodKey}`;
}

function dispatchAnalytics(detail: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tap:analytics", { detail }));
}

/** Cents already redeemed against this benefit in its current period. */
export function redeemedCents(userId: string | null, b: CardBenefit, now = new Date()): number {
  if (b.kind !== "redeemable" || b.value_cents == null) return 0;
  const { key } = currentPeriod(b.cadence, now);
  const bag = read(userId);
  return bag[bagKey(b.card_catalog_id, b.id, key)]?.redeemed_cents ?? 0;
}

export function remainingCents(userId: string | null, b: CardBenefit, now = new Date()): number {
  if (b.kind !== "redeemable" || b.value_cents == null) return 0;
  return Math.max(0, b.value_cents - redeemedCents(userId, b, now));
}

/** Mark cents redeemed. Local write is immediate; server mirror is best-effort. */
export function redeem(
  userId: string | null,
  b: CardBenefit,
  cents: number,
  now = new Date(),
): void {
  if (b.kind !== "redeemable" || b.value_cents == null) return;
  if (!Number.isFinite(cents) || cents <= 0) return;
  const { key } = currentPeriod(b.cadence, now);
  const bag = read(userId);
  const existing = bag[bagKey(b.card_catalog_id, b.id, key)]?.redeemed_cents ?? 0;
  const capped = Math.min(b.value_cents, existing + Math.round(cents));
  bag[bagKey(b.card_catalog_id, b.id, key)] = {
    redeemed_cents: capped,
    redeemed_at: new Date().toISOString(),
  };
  write(userId, bag);

  dispatchAnalytics({
    event: "benefit_redeemed",
    benefit_id: b.id,
    card_catalog_id: b.card_catalog_id,
    cents: capped - existing,
  });

  // Best-effort server mirror (authed users only). Import lazily to keep the
  // server-fn module out of guest bundles that never call it.
  if (userId) {
    void (async () => {
      try {
        const { upsertBenefitRedemption } = await import("./benefits.functions");
        await upsertBenefitRedemption({
          data: {
            card_catalog_id: b.card_catalog_id,
            benefit_id: b.id,
            period_key: key,
            redeemed_cents: capped,
          },
        });
      } catch {
        // Silent: the local write is authoritative; reconciled on next load.
      }
    })();
  }
}

/** Reconcile local storage with server rows (max wins). Call once on load. */
export async function syncFromServer(userId: string | null): Promise<void> {
  if (!userId || typeof window === "undefined") return;
  try {
    const { listBenefitRedemptions } = await import("./benefits.functions");
    const { rows } = await listBenefitRedemptions();
    if (!rows.length) return;
    const bag = read(userId);
    let changed = false;
    for (const r of rows) {
      const key = bagKey(r.card_catalog_id, r.benefit_id, r.period_key);
      const local = bag[key]?.redeemed_cents ?? 0;
      const merged = Math.max(local, r.redeemed_cents);
      if (merged !== local) {
        bag[key] = { redeemed_cents: merged, redeemed_at: r.redeemed_at };
        changed = true;
      }
    }
    if (changed) write(userId, bag);
  } catch {
    // Silent: local state remains valid.
  }
}

/**
 * Fire benefit_expired once per benefit per rolled-over period when the
 * previous period ended with unredeemed value. Idempotent via a local marker.
 */
export function detectExpiredBenefits(
  userId: string | null,
  catalogIds: string[],
  now = new Date(),
): void {
  if (typeof window === "undefined") return;
  const bag = read(userId);
  for (const cid of catalogIds) {
    for (const b of BENEFITS_BY_CARD[cid] ?? []) {
      if (b.kind !== "redeemable" || b.value_cents == null) continue;
      const prevKey = previousPeriodKey(b.cadence, now);
      const prevRedeemed = bag[bagKey(b.card_catalog_id, b.id, prevKey)]?.redeemed_cents ?? 0;
      const unused = b.value_cents - prevRedeemed;
      if (unused <= 0) continue;
      const marker = `${EXPIRED_PREFIX}${userId ?? "guest"}::${b.card_catalog_id}::${b.id}::${prevKey}`;
      try {
        if (window.localStorage.getItem(marker)) continue;
        window.localStorage.setItem(marker, "1");
      } catch {
        continue;
      }
      dispatchAnalytics({
        event: "benefit_expired",
        benefit_id: b.id,
        card_catalog_id: b.card_catalog_id,
        period_key: prevKey,
        unredeemed_cents: unused,
      });
    }
  }
}

/** Emit benefit_surfaced once per benefit per surface per session. */
const SURFACED_KEY = "tap.benefits.surfaced.v1";
function alreadySurfaced(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.sessionStorage.getItem(SURFACED_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (set.includes(key)) return true;
    set.push(key);
    window.sessionStorage.setItem(SURFACED_KEY, JSON.stringify(set.slice(-100)));
    return false;
  } catch {
    return true;
  }
}

export function trackBenefitSurfaced(
  surface: "decide_reason" | "opportunity_pick" | "alert",
  b: { id: string; card_catalog_id: string },
): void {
  const key = `${surface}::${b.card_catalog_id}::${b.id}`;
  if (alreadySurfaced(key)) return;
  dispatchAnalytics({
    event: "benefit_surfaced",
    surface,
    benefit_id: b.id,
    card_catalog_id: b.card_catalog_id,
  });
}

/** Sum of remaining redeemable value across all benefits for a set of cards. */
export function walletUnusedCents(
  userId: string | null,
  catalogIds: string[],
  now = new Date(),
): number {
  let sum = 0;
  for (const cid of catalogIds) {
    for (const b of BENEFITS_BY_CARD[cid] ?? []) {
      sum += remainingCents(userId, b, now);
    }
  }
  return sum;
}

export type BenefitWithState = {
  benefit: CardBenefit;
  remaining_cents: number;
  ends_at: Date;
};

export function benefitsForCard(
  userId: string | null,
  catalogId: string,
  now = new Date(),
): BenefitWithState[] {
  const out: BenefitWithState[] = [];
  for (const b of BENEFITS_BY_CARD[catalogId] ?? []) {
    const { endsAt } = currentPeriod(b.cadence, now);
    out.push({
      benefit: b,
      remaining_cents: remainingCents(userId, b, now),
      ends_at: endsAt,
    });
  }
  return out;
}

export function walletTopAtStake(
  userId: string | null,
  catalogIds: string[],
  now = new Date(),
): { card_catalog_id: string; cents: number; ends_at: Date | null } | null {
  let best: { card_catalog_id: string; cents: number; ends_at: Date | null } | null = null;
  for (const cid of catalogIds) {
    let cents = 0;
    let earliestEnd: Date | null = null;
    for (const b of BENEFITS_BY_CARD[cid] ?? []) {
      const rem = remainingCents(userId, b, now);
      if (rem <= 0) continue;
      cents += rem;
      const { endsAt } = currentPeriod(b.cadence, now);
      if (!earliestEnd || endsAt < earliestEnd) earliestEnd = endsAt;
    }
    if (cents > 0 && (!best || cents > best.cents)) {
      best = { card_catalog_id: cid, cents, ends_at: earliestEnd };
    }
  }
  return best;
}

export function walletNextDeadline(
  userId: string | null,
  catalogIds: string[],
  now = new Date(),
): Date | null {
  let earliest: Date | null = null;
  for (const cid of catalogIds) {
    for (const b of BENEFITS_BY_CARD[cid] ?? []) {
      if (remainingCents(userId, b, now) <= 0) continue;
      const { endsAt } = currentPeriod(b.cadence, now);
      if (!earliest || endsAt < earliest) earliest = endsAt;
    }
  }
  return earliest;
}
