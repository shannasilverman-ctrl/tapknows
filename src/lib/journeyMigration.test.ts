// Executable proof for JP-1: the additive journey_events migration carries
// exactly the pinned row contract, RLS, and policy semantics — and touches
// nothing else. No live database: this reads the migration SQL as text and
// asserts its shape, the same technique the repo already uses to keep a
// generated schema honest without a running Postgres.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "supabase", "migrations");

function findJourneyEventsMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    if (/CREATE TABLE\s+public\.journey_events/i.test(sql)) {
      return { file, sql };
    }
  }
  throw new Error("no migration creates public.journey_events");
}

describe("journey_events migration", () => {
  const { sql } = findJourneyEventsMigration();

  it("creates the table with the pinned column contract", () => {
    expect(sql).toMatch(/CREATE TABLE\s+public\.journey_events/i);
    expect(sql).toMatch(/id\s+UUID\s+NOT NULL\s+DEFAULT\s+gen_random_uuid\(\)\s+PRIMARY KEY/i);
    expect(sql).toMatch(/client_id\s+TEXT\s+NOT NULL/i);
    expect(sql).toMatch(/name\s+TEXT\s+NOT NULL/i);
    expect(sql).toMatch(/props\s+JSONB\s+NOT NULL\s+DEFAULT\s+'\{\}'/i);
    expect(sql).toMatch(/\bat\s+TIMESTAMPTZ\s+NOT NULL\b/i);
    expect(sql).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT\s+now\(\)/i);
  });

  it("restricts name to exactly the nine canonical journey event names", () => {
    const names = [
      "wallet_ready",
      "merchant_selected",
      "recommendation_viewed",
      "proof_opened",
      "payment_choice_recorded",
      "wallet_opened",
      "situation_tried",
      "card_guide_opened",
      "benefit_detail_opened",
    ];
    const checkMatch = sql.match(/CHECK\s*\(\s*name\s+IN\s*\(([^)]+)\)\s*\)/i);
    expect(checkMatch).not.toBeNull();
    const listed = (checkMatch![1].match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1));
    expect(listed.sort()).toEqual([...names].sort());
  });

  it("enables row-level security", () => {
    expect(sql).toMatch(/ALTER TABLE\s+public\.journey_events\s+ENABLE ROW LEVEL SECURITY/i);
  });

  it("grants INSERT to anon and authenticated under one policy requiring client_id", () => {
    expect(sql).toMatch(/GRANT INSERT ON public\.journey_events TO anon, authenticated/i);
    const insertPolicyMatch = sql.match(
      /CREATE POLICY\s+"[^"]+"\s*\nON public\.journey_events FOR INSERT\s*\nTO anon, authenticated\s*\nWITH CHECK \(([\s\S]+?)\);/i,
    );
    expect(insertPolicyMatch).not.toBeNull();
    expect(insertPolicyMatch![1]).toMatch(/client_id IS NOT NULL/i);
  });

  it("gates SELECT to admins only via public.has_role", () => {
    const selectPolicyMatch = sql.match(
      /CREATE POLICY\s+"[^"]+"\s*\nON public\.journey_events FOR SELECT\s*\nTO authenticated\s*\nUSING \(([\s\S]+?)\);/i,
    );
    expect(selectPolicyMatch).not.toBeNull();
    expect(selectPolicyMatch![1]).toMatch(/public\.has_role\(auth\.uid\(\),\s*'admin'\)/i);
  });

  it("touches no other table — no ALTER, DROP, or policy statement targeting anything else", () => {
    // The table's own RLS-enable statement is an ALTER TABLE on itself — that's
    // expected and fine. Nothing may ALTER or DROP any OTHER table.
    const alterTargets = [...sql.matchAll(/ALTER\s+TABLE\s+public\.(\w+)/gi)]
      .map((m) => m[1])
      .filter((t) => t !== "journey_events");
    expect(alterTargets).toEqual([]);
    expect(sql).not.toMatch(/\bDROP\b/i);
    const otherTargets = [...sql.matchAll(/ON\s+public\.(\w+)/gi)]
      .map((m) => m[1])
      .filter((t) => t !== "journey_events");
    expect(otherTargets).toEqual([]);
  });
});
