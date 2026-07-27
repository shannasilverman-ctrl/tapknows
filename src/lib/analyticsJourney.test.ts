// Executable proof for JR-2: admin-gated funnel readback, exactly like
// getAdminStats — a structural assertion on the getJourneyFunnel declaration
// chain (auth middleware + admin check present) plus a fake-Supabase-client
// run proving the exported core issues the journey_events read and returns
// JR-1's five-step funnel shape.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { queryJourneyFunnelCore } from "./analytics.functions";

describe("getJourneyFunnel declaration chain", () => {
  const source = readFileSync(join(__dirname, "analytics.functions.ts"), "utf8");

  it("carries the requireSupabaseAuth middleware", () => {
    // Locate the getJourneyFunnel export and confirm the auth middleware sits
    // in its own chain, the same shape as the pre-existing getAdminStats.
    const match = source.match(
      /export const getJourneyFunnel\s*=\s*createServerFn\([^)]*\)[\s\S]*?;\n/,
    );
    expect(match).not.toBeNull();
    const decl = match![0];
    expect(decl).toMatch(/\.middleware\(\[\s*requireSupabaseAuth\s*\]\)/);
  });

  it("carries the admin role check inside its handler", () => {
    const match = source.match(
      /export const getJourneyFunnel\s*=\s*createServerFn\([^)]*\)[\s\S]*?;\n/,
    );
    const decl = match![0];
    expect(decl).toMatch(/has_role/);
    expect(decl).toMatch(/'admin'|"admin"/);
  });
});

describe("the funnel readback has a reachable operator consumer", () => {
  const adminRoute = readFileSync(join(__dirname, "..", "routes", "admin.tsx"), "utf8");

  it("the admin route imports, binds, and invokes getJourneyFunnel", () => {
    expect(adminRoute).toMatch(
      /import\s*\{[^}]*getJourneyFunnel[^}]*\}\s*from\s*["']@\/lib\/analytics\.functions["']/,
    );
    expect(adminRoute).toMatch(/useServerFn\(getJourneyFunnel\)/);
    // Bound and actually called — a binding no one invokes is not a readback.
    const binding = adminRoute.match(/const\s+(\w+)\s*=\s*useServerFn\(getJourneyFunnel\)/);
    expect(binding).not.toBeNull();
    expect(adminRoute).toMatch(new RegExp(`${binding![1]}\\(\\{\\}\\)`));
  });

  it("the admin route renders every field of the five-step result", () => {
    // step, count and dropOff all reach the operator's screen.
    expect(adminRoute).toMatch(/\.map\(\(row\)\s*=>/);
    expect(adminRoute).toMatch(/row\.step/);
    expect(adminRoute).toMatch(/row\.count/);
    expect(adminRoute).toMatch(/row\.dropOff/);
  });

  it("labels every canonical funnel step it renders", () => {
    for (const step of [
      "wallet_ready",
      "merchant_selected",
      "recommendation_viewed",
      "proof_opened",
      "payment_choice_recorded",
    ]) {
      expect(adminRoute).toContain(step);
    }
  });
});

describe("the proof step of the funnel is emitted by a production surface", () => {
  const proofTrigger = readFileSync(
    join(__dirname, "..", "components", "see-the-math.tsx"),
    "utf8",
  );

  it("emits proof_opened from the proof trigger's own open handler", () => {
    expect(proofTrigger).toMatch(/import\s*\{[^}]*trackJourneyEvent[^}]*\}/);
    // The emit sits inside the trigger's onClick, ahead of the sheet opening,
    // so the funnel's fourth step cannot be zero while proofs are being read.
    const handler = proofTrigger.match(/onClick=\{\(\)\s*=>\s*\{[\s\S]*?\n\s*\}\}/);
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/trackJourneyEvent\(\s*["']proof_opened["']/);
    expect(handler![0].indexOf("trackJourneyEvent")).toBeLessThan(
      handler![0].indexOf("setOpen(true)"),
    );
  });

  it("carries only allowlisted context — merchant and category slugs, never amounts", () => {
    const handler = proofTrigger.match(/trackJourneyEvent\(\s*["']proof_opened["'][\s\S]*?\}\);/);
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/merchant/);
    expect(handler![0]).toMatch(/category/);
    expect(handler![0]).not.toMatch(/amount/i);
  });
});

type FakeRow = { client_id: string; name: string };

function makeFakeClient(rows: FakeRow[]) {
  const calls: { table: string; columns: string }[] = [];
  return {
    client: {
      from(table: string) {
        return {
          select(columns: string) {
            calls.push({ table, columns });
            return Promise.resolve({ data: rows, error: null });
          },
        };
      },
    },
    calls,
  };
}

describe("queryJourneyFunnelCore", () => {
  it("reads from journey_events and returns the five-step funnel shape", async () => {
    const { client, calls } = makeFakeClient([
      { client_id: "c1", name: "wallet_ready" },
      { client_id: "c2", name: "wallet_ready" },
      { client_id: "c1", name: "merchant_selected" },
    ]);

    const out = await queryJourneyFunnelCore(client as never);

    expect(calls[0].table).toBe("journey_events");
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ step: "wallet_ready", count: 2, dropOff: null });
    expect(out[1].count).toBe(1);
  });
});
