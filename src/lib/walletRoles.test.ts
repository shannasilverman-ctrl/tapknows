import { describe, expect, it } from "vitest";
import { computeWalletRoles } from "./walletRoles";
import type { CardCatalog, PointsProgram, UserCard } from "./types";

const PROGRAMS: Record<string, PointsProgram> = {
  cashback: { id: "cashback", name: "Cash Back", kind: "cashback", default_cpp: 0.01 },
  ur: { id: "ur", name: "UR", kind: "transferable", default_cpp: 0.02 },
  mr: { id: "mr", name: "MR", kind: "transferable", default_cpp: 0.02 },
};

function mkCard(p: Partial<CardCatalog> & Pick<CardCatalog, "id" | "earn_rules">): CardCatalog {
  return {
    issuer: "Test",
    name: p.id,
    annual_fee: 0,
    points_program_id: "cashback",
    foreign_tx_fee_pct: 0,
    notes: null,
    ...p,
  } as CardCatalog;
}
function mkUc(id: string, cardId: string): UserCard {
  return {
    id,
    user_id: "u",
    card_catalog_id: cardId,
    nickname: null,
    opened_at: null,
    annual_fee_paid_at: null,
    created_at: "",
  };
}
function cat(...cs: CardCatalog[]): Record<string, CardCatalog> {
  const out: Record<string, CardCatalog> = {};
  for (const c of cs) out[c.id] = c;
  return out;
}

describe("walletRoles", () => {
  it("wallet of one card returns only the Everyday role", () => {
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc")],
      catalog: cat(dc),
      programs: PROGRAMS,
    });
    expect(roles.map((r) => r.key)).toEqual(["everyday"]);
    expect(roles[0].userCardId).toBe("u_dc");
  });

  it("all-flat wallet where one card sweeps every domain shows only Everyday", () => {
    // Double Cash 2% flat vs a 1% flat card. DC wins everything; the 1% card
    // never becomes a specialist. No fake grocery/dining/etc roles.
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const one = mkCard({
      id: "one",
      earn_rules: [{ category: "everything_else", multiplier: 0.01 }],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc"), mkUc("u_one", "one")],
      catalog: cat(dc, one),
      programs: PROGRAMS,
    });
    expect(roles.map((r) => r.key)).toEqual(["everyday"]);
  });

  it("assigns clear specialists when they beat the everyday card", () => {
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const bcp = mkCard({
      id: "bcp",
      earn_rules: [
        { category: "groceries", multiplier: 0.06 },
        { category: "everything_else", multiplier: 0.01 },
      ],
    });
    const gold = mkCard({
      id: "gold",
      points_program_id: "mr",
      earn_rules: [
        { category: "dining", multiplier: 4 },
        { category: "groceries", multiplier: 4 },
        { category: "everything_else", multiplier: 1 },
      ],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc"), mkUc("u_bcp", "bcp"), mkUc("u_gold", "gold")],
      catalog: cat(dc, bcp, gold),
      programs: PROGRAMS,
    });
    const byKey = Object.fromEntries(roles.map((r) => [r.key, r]));
    expect(byKey.everyday.cardCatalogId).toBe("dc");
    // Groceries: BCP 6% on $100 = $6 beats Gold 4*$100*2¢ = $8. Gold wins.
    expect(byKey.groceries.cardCatalogId).toBe("gold");
    expect(byKey.dining.cardCatalogId).toBe("gold");
  });

  it("tie on Everyday breaks toward the more frequently used card", () => {
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const twin = mkCard({
      id: "twin",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc"), mkUc("u_twin", "twin")],
      catalog: cat(dc, twin),
      programs: PROGRAMS,
      frecencyByCardId: { u_twin: 10, u_dc: 1 },
    });
    expect(roles[0].userCardId).toBe("u_twin");
  });

  it("online role emerges only when a card actually specializes there (e.g. Amazon 5%)", () => {
    const dc = mkCard({
      id: "dc",
      earn_rules: [{ category: "everything_else", multiplier: 0.02 }],
    });
    const prime = mkCard({
      id: "prime",
      earn_rules: [
        { category: "amazon", multiplier: 0.05 },
        { category: "everything_else", multiplier: 0.01 },
      ],
    });
    const roles = computeWalletRoles({
      userCards: [mkUc("u_dc", "dc"), mkUc("u_prime", "prime")],
      catalog: cat(dc, prime),
      programs: PROGRAMS,
    });
    const online = roles.find((r) => r.key === "online");
    expect(online?.cardCatalogId).toBe("prime");
  });
});
