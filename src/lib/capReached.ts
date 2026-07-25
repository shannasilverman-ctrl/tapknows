// Local-first "bonus cap reached" toggle. Keyed per user (or "guest") so
// signing in doesn't leak state across sessions. Auto-resets at period
// boundaries by encoding the current period key into the bag key — a stale
// key is simply never read again.
//
// Shape:
//   `${userCardId}::${category}::${periodKey}` -> true
//
// Structured so a future data source (e.g. Plaid category spend) can set the
// same flag automatically without changing consumers.

import { currentPeriod } from "./benefits";

const KEY_PREFIX = "tap.capReached.v1.";

export type CapPeriod = "monthly" | "quarterly" | "annual";

function ownerKey(userId: string | null): string {
  return `${KEY_PREFIX}${userId ?? "guest"}`;
}

function read(userId: string | null): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ownerKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function write(userId: string | null, bag: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ownerKey(userId), JSON.stringify(bag));
    window.dispatchEvent(new Event("tap:capReached"));
  } catch {}
}

function bagKey(userCardId: string, category: string, period: CapPeriod, now = new Date()) {
  const { key } = currentPeriod(period, now);
  return `${userCardId}::${category}::${key}`;
}

export function isCapReached(
  userId: string | null,
  userCardId: string,
  category: string,
  period: CapPeriod,
  now = new Date(),
): boolean {
  const bag = read(userId);
  return !!bag[bagKey(userCardId, category, period, now)];
}

export function setCapReached(
  userId: string | null,
  userCardId: string,
  category: string,
  period: CapPeriod,
  reached: boolean,
  now = new Date(),
): void {
  const bag = read(userId);
  const k = bagKey(userCardId, category, period, now);
  if (reached) bag[k] = true;
  else delete bag[k];
  write(userId, bag);
}

/**
 * Build the shape recommendationEngine.EngineInput.capReachedCategoriesByCard
 * expects: Record<userCardId, category[]> for the CURRENT period only.
 * Caller passes the wallet + each capped rule's period so we can look up
 * exact keys without scanning the whole bag.
 */
export function capReachedByCardMap(
  userId: string | null,
  entries: Array<{ userCardId: string; category: string; period: CapPeriod }>,
  now = new Date(),
): Record<string, string[]> {
  const bag = read(userId);
  const out: Record<string, string[]> = {};
  for (const e of entries) {
    const k = bagKey(e.userCardId, e.category, e.period, now);
    if (bag[k]) {
      (out[e.userCardId] ??= []).push(e.category);
    }
  }
  return out;
}
