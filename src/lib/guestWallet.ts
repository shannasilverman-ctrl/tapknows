// Local guest-mode wallet, mirrored into the account on sign-in via migrate_guest_wallet RPC.
// Kept as a small typed localStorage wrapper — no React deps.

const KEY = "card_savvy_guest_wallet_v1";

export type GuestCard = {
  id: string; // client-generated slug, replaced by real uuid at migration time
  card_catalog_id: string;
  nickname?: string | null;
};

export type GuestOffer = {
  id: string;
  user_card_id: string; // matches a GuestCard.id
  merchant_text: string;
  offer_type:
    | "dollars_off_threshold"
    | "percent_back"
    | "bonus_points"
    | "multiplier"
    | "statement_credit";
  reward_type: "multiplier" | "percent_back" | "statement_credit"; // legacy compat
  reward_value: number;
  min_spend: number;
  max_benefit?: number | null;
  expires_at?: string | null;
};

export type GuestOverride = {
  points_program_id: string;
  cpp: number;
};

export type GuestAccount = {
  user_card_id: string; // matches GuestCard.id
  credit_limit_cents: number | null;
  current_balance_cents: number | null;
};

export type GuestPrefs = {
  utilization_enabled: boolean;
  utilization_threshold_pct: number; // 1..90
  utilization_behavior: "warn" | "rerank" | "split";
};

export type GuestWallet = {
  cards: GuestCard[];
  offers: GuestOffer[];
  overrides: GuestOverride[];
  accounts: GuestAccount[];
  prefs: GuestPrefs;
};

const emptyPrefs: GuestPrefs = {
  utilization_enabled: false,
  utilization_threshold_pct: 10,
  utilization_behavior: "warn",
};

function emptyWallet(): GuestWallet {
  return {
    cards: [],
    offers: [],
    overrides: [],
    accounts: [],
    prefs: { ...emptyPrefs },
  };
}

export function getGuestWallet(): GuestWallet {
  if (typeof window === "undefined") return emptyWallet();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyWallet();
    const parsed = JSON.parse(raw) as Partial<GuestWallet>;
    const cardByCatalog = new Map<string, GuestCard>();
    const canonicalIdById = new Map<string, string>();
    for (const card of parsed.cards ?? []) {
      const existing = cardByCatalog.get(card.card_catalog_id);
      if (existing) {
        canonicalIdById.set(card.id, existing.id);
        continue;
      }
      const clean = { ...card };
      cardByCatalog.set(clean.card_catalog_id, clean);
      canonicalIdById.set(clean.id, clean.id);
    }
    const cards = Array.from(cardByCatalog.values());
    const canonicalCardIds = new Set(cards.map((card) => card.id));
    const canonicalCardId = (id: string) => canonicalIdById.get(id) ?? id;

    const offers = (parsed.offers ?? [])
      .map((offer) => ({ ...offer, user_card_id: canonicalCardId(offer.user_card_id) }))
      .filter((offer) => canonicalCardIds.has(offer.user_card_id));

    const accountByCard = new Map<string, GuestAccount>();
    for (const account of parsed.accounts ?? []) {
      const userCardId = canonicalCardId(account.user_card_id);
      if (!canonicalCardIds.has(userCardId)) continue;
      accountByCard.set(userCardId, { ...account, user_card_id: userCardId });
    }

    return {
      cards,
      offers,
      overrides: (parsed.overrides ?? []).map((override) => ({ ...override })),
      accounts: Array.from(accountByCard.values()),
      prefs: { ...emptyPrefs, ...(parsed.prefs ?? {}) },
    };
  } catch {
    return emptyWallet();
  }
}

function save(w: GuestWallet): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(w));
}

function newId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `guest_${rnd}`;
}

export function addGuestCard(card_catalog_id: string, nickname?: string | null): GuestCard {
  const w = getGuestWallet();
  const existing = w.cards.find((card) => card.card_catalog_id === card_catalog_id);
  if (existing) return existing;
  const c: GuestCard = { id: newId(), card_catalog_id, nickname: nickname ?? null };
  w.cards.push(c);
  save(w);
  return c;
}

export function removeGuestCard(id: string): void {
  const w = getGuestWallet();
  w.cards = w.cards.filter((c) => c.id !== id);
  w.offers = w.offers.filter((o) => o.user_card_id !== id);
  save(w);
}

export function updateGuestCardNickname(id: string, nickname: string | null): void {
  const w = getGuestWallet();
  const c = w.cards.find((c) => c.id === id);
  if (!c) return;
  c.nickname = nickname && nickname.length > 0 ? nickname : null;
  save(w);
}

export function addGuestOffer(o: Omit<GuestOffer, "id">): GuestOffer {
  const w = getGuestWallet();
  const full: GuestOffer = { ...o, id: newId() };
  w.offers.push(full);
  save(w);
  return full;
}

export function removeGuestOffer(id: string): void {
  const w = getGuestWallet();
  w.offers = w.offers.filter((o) => o.id !== id);
  save(w);
}

export function setGuestOverride(points_program_id: string, cpp: number): void {
  const w = getGuestWallet();
  const existing = w.overrides.find((o) => o.points_program_id === points_program_id);
  if (existing) existing.cpp = cpp;
  else w.overrides.push({ points_program_id, cpp });
  save(w);
}

export function setGuestAccount(
  user_card_id: string,
  credit_limit_cents: number | null,
  current_balance_cents: number | null,
): void {
  const w = getGuestWallet();
  const existing = w.accounts.find((a) => a.user_card_id === user_card_id);
  if (existing) {
    existing.credit_limit_cents = credit_limit_cents;
    existing.current_balance_cents = current_balance_cents;
  } else {
    w.accounts.push({ user_card_id, credit_limit_cents, current_balance_cents });
  }
  save(w);
}

export function removeGuestAccount(user_card_id: string): void {
  const w = getGuestWallet();
  w.accounts = w.accounts.filter((a) => a.user_card_id !== user_card_id);
  save(w);
}

export function setGuestPrefs(patch: Partial<GuestPrefs>): void {
  const w = getGuestWallet();
  w.prefs = { ...w.prefs, ...patch };
  save(w);
}

export function clearGuestWallet(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function hasGuestData(): boolean {
  const w = getGuestWallet();
  return (
    w.cards.length > 0 || w.offers.length > 0 || w.overrides.length > 0 || w.accounts.length > 0
  );
}
