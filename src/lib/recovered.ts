// Tracks "recovered" cents from acted-on recommendations (localStorage).
// Shared by guest and authed sessions so the home balance line always has
// a source of truth without a schema change.

const KEY = "tap_recovered_v1";

type Entry = { at: string; cents: number };

type Bag = { entries: Entry[] };

function read(): Bag {
  if (typeof window === "undefined") return { entries: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as Bag;
    if (!parsed?.entries) return { entries: [] };
    return parsed;
  } catch {
    return { entries: [] };
  }
}

function write(b: Bag) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(b));
    window.dispatchEvent(new Event("tap:recovered"));
  } catch {
    // ignore quota
  }
}

/** Record an earnings event (cents recovered vs default). */
export function recordRecovered(cents: number) {
  if (!Number.isFinite(cents) || cents <= 0) return;
  const b = read();
  b.entries.push({ at: new Date().toISOString(), cents: Math.round(cents) });
  // Keep bounded — 400 entries plenty for a monthly rollup.
  if (b.entries.length > 400) b.entries = b.entries.slice(-400);
  write(b);
}

/** Cents recovered so far in the current calendar month. */
export function recoveredThisMonthCents(): number {
  const b = read();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return b.entries.reduce((sum, e) => {
    const d = new Date(e.at);
    if (d.getFullYear() === y && d.getMonth() === m) return sum + e.cents;
    return sum;
  }, 0);
}
