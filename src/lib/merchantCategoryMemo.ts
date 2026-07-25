// Persistent per-merchant category corrections. When a user overrides the
// category for a merchant, that mapping wins for every future resolution of
// that merchant on this device. Local-first; the same shape supports future
// server sync (same pattern as benefit redemptions).
//
// Keyed per user (or "guest") so signing in doesn't leak state across
// sessions. Normalized on the merchant STRING (lowercased, whitespace
// collapsed), so typed "whole foods" and stored "Whole Foods" both hit.

const LEGACY_KEY = "tap.merchantCategories";
const KEY_PREFIX = "tap.merchantCategories.v1.";

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function ownerKey(userId: string | null): string {
  return `${KEY_PREFIX}${userId ?? "guest"}`;
}

function read(userId: string | null): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    // Migrate legacy (non-user-scoped) bag once into the guest namespace.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      try {
        const guestKey = `${KEY_PREFIX}guest`;
        if (!window.localStorage.getItem(guestKey)) {
          window.localStorage.setItem(guestKey, legacy);
        }
      } catch {}
      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {}
    }
    const raw = window.localStorage.getItem(ownerKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function write(userId: string | null, map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ownerKey(userId), JSON.stringify(map));
    window.dispatchEvent(new Event("tap:merchantCategories"));
  } catch {}
}

/** Save a user's correction for a merchant. Wins over default category. */
export function setMerchantCategory(userId: string | null, name: string, categoryId: string): void {
  if (!name.trim()) return;
  const map = read(userId);
  map[norm(name)] = categoryId;
  write(userId, map);
}

/** Recall a user's correction for a merchant (null when none). */
export function getMerchantCategory(userId: string | null, name: string): string | null {
  if (!name.trim()) return null;
  return read(userId)[norm(name)] ?? null;
}

export function clearMerchantCategory(userId: string | null, name: string): void {
  if (!name.trim()) return;
  const map = read(userId);
  if (delete map[norm(name)]) write(userId, map);
}

// ── Back-compat wrappers ───────────────────────────────────────────────────
// Older call sites (home.tsx) pass no user id; they map to the guest bag,
// which is exactly the pre-v1 behavior. New sites should call the
// user-scoped functions above with useAuth().user?.id.

export function rememberMerchantCategory(name: string, categoryId: string) {
  setMerchantCategory(null, name, categoryId);
}

export function recallMerchantCategory(name: string): string | null {
  return getMerchantCategory(null, name);
}

export const FALLBACK_CATEGORIES: { id: string; label: string }[] = [
  { id: "dining", label: "Dining" },
  { id: "groceries", label: "Groceries" },
  { id: "gas", label: "Gas" },
  { id: "travel", label: "Travel" },
  { id: "everything_else", label: "Retail" },
  { id: "everything_else", label: "Everything else" },
];
