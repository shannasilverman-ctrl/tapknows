// Merchant fee memory.
//
// A customer who tells TAP "this place charges 3% on cards" should never have
// to tell it twice. The fee is remembered per merchant, survives a reload, and
// resurfaces as a visible notice the next time that merchant comes up — never
// as a silent adjustment to the math.
//
// Pure and storage-backed: no React, no router, no Supabase. Guest-safe by
// design — this is local knowledge about a place, not account data.

const STORAGE_KEY = "tap.merchantFeeMemory.v1";

export type MerchantFee = {
  /** Catalog or local merchant id, e.g. `whole_foods` / `local_amazon`. */
  merchantId: string;
  /** Surcharge percent as entered by the customer, e.g. `3` for 3%. */
  feePct: number;
  /** ISO timestamp of when the customer last told us. */
  recordedAt: string;
};

type FeeTable = Record<string, MerchantFee>;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Read the whole table from storage on every call — no in-memory cache, so a
 * reload (or a fresh module instance) sees exactly what was persisted.
 */
function readTable(): FeeTable {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as FeeTable;
  } catch {
    return {};
  }
}

function writeTable(table: FeeTable): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(table));
  } catch {}
}

/**
 * Remember a surcharge the customer entered for a merchant.
 *
 * A non-positive or non-finite fee clears the memory instead of storing a
 * meaningless zero — "actually there is no fee here" is a correction, not a
 * data point to resurface.
 */
export function rememberMerchantFee(merchantId: string, feePct: number, now = new Date()): void {
  if (!merchantId) return;
  if (!Number.isFinite(feePct) || feePct <= 0) {
    forgetMerchantFee(merchantId);
    return;
  }
  const table = readTable();
  table[merchantId] = {
    merchantId,
    feePct,
    recordedAt: now.toISOString(),
  };
  writeTable(table);
}

/** The remembered fee for a merchant, or null if TAP was never told about one. */
export function recallMerchantFee(merchantId: string): MerchantFee | null {
  if (!merchantId) return null;
  const entry = readTable()[merchantId];
  if (!entry || typeof entry.feePct !== "number" || !Number.isFinite(entry.feePct)) return null;
  if (entry.feePct <= 0) return null;
  return entry;
}

/** Convenience for render paths that only need the number. */
export function recallMerchantFeePct(merchantId: string): number {
  return recallMerchantFee(merchantId)?.feePct ?? 0;
}

/** Forget one merchant's fee. */
export function forgetMerchantFee(merchantId: string): void {
  const table = readTable();
  if (!(merchantId in table)) return;
  delete table[merchantId];
  writeTable(table);
}

/** Forget every remembered fee. */
export function clearFeeMemory(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {}
}

/** Every remembered fee, newest first — for a future "places that charge" view. */
export function allRememberedFees(): MerchantFee[] {
  return Object.values(readTable())
    .filter((f) => Number.isFinite(f?.feePct) && f.feePct > 0)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1));
}
