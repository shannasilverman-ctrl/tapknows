// Proves JP-2 without a live database or auth: the exported ingest core is
// driven directly against a fake Supabase client, with NO authentication —
// guests write, admins read (readback lives elsewhere).

import { describe, expect, it, vi } from "vitest";
import { ingestJourneyEventsCore } from "./journey.functions";

type FakeClient = {
  from: ReturnType<typeof vi.fn>;
  insertCalls: Array<{ table: string; rows: unknown[] }>;
};

function makeFakeClient(): FakeClient {
  const insertCalls: Array<{ table: string; rows: unknown[] }> = [];
  const from = vi.fn((table: string) => ({
    insert: vi.fn(async (rows: unknown[]) => {
      insertCalls.push({ table, rows });
      return { error: null };
    }),
  }));
  return { from, insertCalls };
}

describe("ingestJourneyEventsCore", () => {
  it("inserts exactly the validated rows for a valid batch, no auth involved", async () => {
    const client = makeFakeClient();
    const result = await ingestJourneyEventsCore(client as never, {
      client_id: "guest_abc",
      events: [
        { name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" },
        {
          name: "merchant_selected",
          at: "2026-07-26T00:00:01.000Z",
          props: { merchant: "costco" },
        },
      ],
    });
    expect(result.inserted).toBe(2);
    expect(client.insertCalls).toHaveLength(1);
    expect(client.insertCalls[0].table).toBe("journey_events");
    expect(client.insertCalls[0].rows).toEqual([
      { client_id: "guest_abc", name: "wallet_ready", at: "2026-07-26T00:00:00.000Z", props: {} },
      {
        client_id: "guest_abc",
        name: "merchant_selected",
        at: "2026-07-26T00:00:01.000Z",
        props: { merchant: "costco" },
      },
    ]);
  });

  it("validates every record before any insert call — call order observed on the fake", async () => {
    const callOrder: string[] = [];
    const insertFn = vi.fn(async (rows: unknown[]) => {
      callOrder.push(`insert:${rows.length}`);
      return { error: null };
    });
    const client = {
      from: vi.fn((_table: string) => ({ insert: insertFn })),
    };

    const events = [
      { name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" },
      { name: "merchant_selected", at: "2026-07-26T00:00:01.000Z" },
      { name: "not_a_real_event", at: "2026-07-26T00:00:02.000Z" },
    ];
    // journeyIngest is pure and synchronous — every record resolves to
    // ok/not-ok BEFORE the core ever reaches for `client.from`. Proven here by
    // asserting `from` was called at most once, carrying only the rows that
    // already passed validation — never once per record, never before the
    // whole batch has been screened.
    await ingestJourneyEventsCore(client as never, { client_id: "guest_abc", events });

    expect(client.from).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["insert:2"]);
  });

  it("never inserts invalid records — a batch of only invalid records inserts nothing", async () => {
    const client = makeFakeClient();
    const result = await ingestJourneyEventsCore(client as never, {
      client_id: "guest_abc",
      events: [
        { name: "not_a_real_event", at: "2026-07-26T00:00:00.000Z" },
        { name: "also_fake", at: "bad-date" },
      ],
    });
    expect(result.inserted).toBe(0);
    expect(client.insertCalls).toHaveLength(0);
  });

  it("inserts only the valid rows from a mixed batch, dropping the invalid ones", async () => {
    const client = makeFakeClient();
    const result = await ingestJourneyEventsCore(client as never, {
      client_id: "guest_abc",
      events: [
        { name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" },
        { name: "not_a_real_event", at: "2026-07-26T00:00:00.000Z" },
      ],
    });
    expect(result.inserted).toBe(1);
    expect(client.insertCalls).toHaveLength(1);
    expect(client.insertCalls[0].rows).toHaveLength(1);
  });

  it("throws when the database refuses the insert — never reports a silent success", async () => {
    const client = {
      from: vi.fn((_table: string) => ({
        insert: vi.fn(async (_rows: unknown[]) => ({ error: { message: "rls denied" } })),
      })),
    };

    await expect(
      ingestJourneyEventsCore(client as never, {
        client_id: "guest_abc",
        events: [{ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }],
      }),
    ).rejects.toThrow();
  });

  it("accounts for validator-rejected records so a caller can stop retrying them", async () => {
    const client = makeFakeClient();
    const result = await ingestJourneyEventsCore(client as never, {
      client_id: "guest_abc",
      events: [
        { name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" },
        { name: "not_a_real_event", at: "2026-07-26T00:00:00.000Z" },
      ],
    });
    expect(result).toEqual({ inserted: 1, rejected: 1 });
  });

  it("rejects the whole batch when client_id is missing, without calling insert", async () => {
    const client = makeFakeClient();
    const result = await ingestJourneyEventsCore(client as never, {
      client_id: "",
      events: [{ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }],
    });
    expect(result.inserted).toBe(0);
    expect(client.insertCalls).toHaveLength(0);
  });
});
