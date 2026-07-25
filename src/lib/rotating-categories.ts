// Static config for cards with rotating 5% categories.
// Update at each quarter turn.

export type QuarterBonus = {
  card_catalog_id: string;
  cardLabel: string;
  categoryLabel: string;
  detail: string;
  multiplier: number; // 5 = 5x
  quarterlyCap: number; // dollars of spend eligible
  quarterEnd: string; // ISO date
  activationDeadline: string; // ISO date
};

function currentQuarterEnd(): Date {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const qEndMonth = Math.floor(m / 3) * 3 + 2; // 2, 5, 8, 11
  const last = new Date(y, qEndMonth + 1, 0);
  last.setHours(23, 59, 59, 999);
  return last;
}

// Q3 2026 (July 1 – September 30, 2026) rotating 5% categories.
// Verified against issuer publications; refresh next quarter.
export function rotatingBonuses(): QuarterBonus[] {
  const end = currentQuarterEnd().toISOString();
  return [
    {
      card_catalog_id: "chase_freedom_flex",
      cardLabel: "Chase Freedom Flex",
      categoryLabel: "Gas, EV charging, transit, live entertainment, United Way",
      detail:
        "Q3 2026: 5% at gas stations and EV charging, on public transit, at select live entertainment, and on United Way donations. Combined $1,500 cap.",
      multiplier: 5,
      quarterlyCap: 1500,
      quarterEnd: end,
      activationDeadline: "2026-09-14T23:59:59.000Z",
    },
    {
      card_catalog_id: "discover_it_cash_back",
      cardLabel: "Discover it",
      categoryLabel: "Transportation, including airlines",
      detail: "Q3 2026: 5% on transportation, including airlines. $1,500 cap this quarter.",
      multiplier: 5,
      quarterlyCap: 1500,
      quarterEnd: end,
      activationDeadline: "2026-09-30T23:59:59.000Z",
    },
  ];
}
