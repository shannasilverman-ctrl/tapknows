import { beforeEach, describe, expect, it, vi } from "vitest";

const { ingestJourneyEvents } = vi.hoisted(() => ({
  ingestJourneyEvents: vi.fn(),
}));

vi.mock("./journey.functions", () => ({
  ingestJourneyEvents,
}));

import {
  __resetJourneyQueueForTest,
  enqueueJourneyEvent,
  flushJourneyQueue,
  getGuestClientId,
  peekJourneyQueue,
} from "./journeyQueue";

// A tiny in-memory Storage stand-in — injectable, so the module never
// depends on jsdom's localStorage for the "survives reinit" proof; a fresh
// object with the SAME backing store is what "module re-initialization"
// means here.
function makeMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
}

/** Every event name the production server function has actually received. */
type SentBatch = { data: { client_id: string; events: { name: string; at: string }[] } };
function sentEventNames(): string[] {
  return (ingestJourneyEvents.mock.calls as unknown as [SentBatch][]).flatMap(([batch]) =>
    batch.data.events.map((event) => event.name),
  );
}

beforeEach(() => {
  __resetJourneyQueueForTest();
  ingestJourneyEvents.mockReset();
  ingestJourneyEvents.mockResolvedValue({ inserted: 0 });
});

describe("journeyQueue", () => {
  it("enqueues a known event and it is visible in the queue", () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, { storage });
    expect(peekJourneyQueue({ storage })).toHaveLength(1);
    expect(peekJourneyQueue({ storage })[0].name).toBe("wallet_ready");
  });

  it("never enqueues an unknown event name", () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent(
      { name: "not_a_real_event" as never, at: "2026-07-26T00:00:00.000Z" },
      {
        storage,
      },
    );
    expect(peekJourneyQueue({ storage })).toHaveLength(0);
  });

  it("survives module re-initialization: the same backing storage is read on a fresh module state", () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent({ name: "wallet_opened", at: "2026-07-26T00:00:00.000Z" }, { storage });
    // Simulate a reload: reset in-module state, re-read from storage.
    __resetJourneyQueueForTest();
    expect(peekJourneyQueue({ storage })).toHaveLength(1);
    expect(peekJourneyQueue({ storage })[0].name).toBe("wallet_opened");
  });

  it("flushes a queue persisted by an earlier session when the browser module really initializes", async () => {
    // The reload case, exercised the way a browser actually does it: a queue
    // already sitting in storage, a real `window`, and the module graph
    // evaluated from scratch through `journeyEvents` — the entry every app
    // surface reaches the queue by. Resetting a latch and re-reading injected
    // storage never touched this path, which is exactly how a swallowed
    // module-initialization error hid here.
    const storage = makeMemoryStorage();
    storage.setItem(
      "tap.journeyQueue.v1",
      JSON.stringify([{ name: "benefit_detail_opened", at: "2026-07-25T12:00:00.000Z" }]),
    );
    ingestJourneyEvents.mockResolvedValue({ inserted: 1, rejected: 0 });

    const listeners: string[] = [];
    vi.stubGlobal("window", {
      localStorage: storage,
      addEventListener: (type: string) => {
        listeners.push(type);
      },
    });

    try {
      vi.resetModules();
      // Import order matters and is the whole point: `journeyEvents` is what
      // the bundle enters, and it pulls `journeyQueue` in behind it.
      await import("./journeyEvents");
      const reloaded = await import("./journeyQueue");

      // The reload flush is handed to a task, so give the task queue a turn.
      await vi.waitFor(() => expect(sentEventNames()).toContain("benefit_detail_opened"));
      await vi.waitFor(() => expect(reloaded.peekJourneyQueue({ storage })).toHaveLength(0));
      expect(listeners).toContain("online");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never removes an event that no flush actually submitted", async () => {
    // Two flushes racing: the first hangs mid-send while more events arrive,
    // the second is invoked before the first resolves. Unserialized, each
    // snapshotted the queue independently and the second acknowledgment sliced
    // off events it had never sent.
    const storage = makeMemoryStorage();
    const enqueued = [
      { name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" },
      { name: "merchant_selected", at: "2026-07-26T00:00:01.000Z" },
      { name: "recommendation_viewed", at: "2026-07-26T00:00:02.000Z" },
    ] as const;

    const submitted: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    let releaseSlow: () => void = () => {};
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const record = (batch: { events: unknown[] }) => {
      for (const event of batch.events as { name: string }[]) submitted.push(event.name);
    };
    const sendSlow = vi.fn(async (batch: { client_id: string; events: unknown[] }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      record(batch);
      await slowGate;
      inFlight -= 1;
      return { inserted: batch.events.length, rejected: 0 };
    });
    const sendFast = vi.fn(async (batch: { client_id: string; events: unknown[] }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      record(batch);
      inFlight -= 1;
      return { inserted: batch.events.length, rejected: 0 };
    });

    enqueueJourneyEvent(enqueued[0], { storage });
    const first = flushJourneyQueue({ storage, send: sendSlow });
    enqueueJourneyEvent(enqueued[1], { storage });
    const second = flushJourneyQueue({ storage, send: sendFast });
    enqueueJourneyEvent(enqueued[2], { storage });
    releaseSlow();
    await Promise.all([first, second]);

    // Drains are serialized: no acknowledgment can account for a batch another
    // drain is still holding.
    expect(maxInFlight).toBe(1);

    // The invariant that actually protects the customer's events: anything the
    // queue dropped must have been submitted by some flush.
    const remaining = peekJourneyQueue({ storage }).map((event) => event.name);
    for (const event of enqueued) {
      if (!submitted.includes(event.name)) expect(remaining).toContain(event.name);
    }
  });

  it("assigns a persistent random guest client_id that survives reinit", () => {
    const storage = makeMemoryStorage();
    const id1 = getGuestClientId({ storage });
    __resetJourneyQueueForTest();
    const id2 = getGuestClientId({ storage });
    expect(id1).toBe(id2);
    expect(id1.length).toBeGreaterThan(0);
  });

  it("flushes queued events to the server function when connectivity returns", async () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, { storage });
    enqueueJourneyEvent(
      { name: "merchant_selected", at: "2026-07-26T00:00:01.000Z" },
      {
        storage,
      },
    );
    const send = vi.fn(async (_batch: { client_id: string; events: unknown[] }) => ({
      inserted: 2,
    }));
    await flushJourneyQueue({ storage, send });
    expect(send).toHaveBeenCalledTimes(1);
    const [arg] = send.mock.calls[0];
    expect(arg.events).toHaveLength(2);
    expect(peekJourneyQueue({ storage })).toHaveLength(0);
  });

  it("uses the production server function when no send is injected", async () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, { storage });
    ingestJourneyEvents.mockResolvedValue({ inserted: 1 });

    await flushJourneyQueue({ storage });

    expect(ingestJourneyEvents).toHaveBeenCalledTimes(1);
    expect(ingestJourneyEvents).toHaveBeenCalledWith({
      data: {
        client_id: expect.any(String),
        events: [{ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }],
      },
    });
    expect(peekJourneyQueue({ storage })).toHaveLength(0);
  });

  it("keeps events enqueued while a flush is in flight", async () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, { storage });
    enqueueJourneyEvent({ name: "merchant_selected", at: "2026-07-26T00:00:01.000Z" }, { storage });
    const send = vi.fn(async () => {
      enqueueJourneyEvent(
        { name: "recommendation_viewed", at: "2026-07-26T00:00:02.000Z" },
        { storage },
      );
      return { inserted: 2 };
    });

    await flushJourneyQueue({ storage, send });

    expect(send).toHaveBeenCalledTimes(1);
    expect(peekJourneyQueue({ storage })).toEqual([
      { name: "recommendation_viewed", at: "2026-07-26T00:00:02.000Z" },
    ]);
  });

  it("schedules a flush after an enqueue made during an ordinary online session", async () => {
    const storage = makeMemoryStorage();
    ingestJourneyEvents.mockResolvedValue({ inserted: 1, rejected: 0 });
    const scheduled: (() => void)[] = [];

    enqueueJourneyEvent(
      { name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" },
      { storage, isOnline: () => true, schedule: (run) => scheduled.push(run) },
    );

    // The send is scheduled, never run on the emit path itself.
    expect(scheduled).toHaveLength(1);
    expect(ingestJourneyEvents).not.toHaveBeenCalled();

    scheduled[0]();
    await vi.waitFor(() => expect(ingestJourneyEvents).toHaveBeenCalledTimes(1));
    expect(ingestJourneyEvents).toHaveBeenCalledWith({
      data: {
        client_id: expect.any(String),
        events: [{ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }],
      },
    });
    expect(peekJourneyQueue({ storage })).toHaveLength(0);
  });

  it("does not schedule a flush while offline — the event just stays queued", () => {
    const storage = makeMemoryStorage();
    const scheduled: (() => void)[] = [];

    enqueueJourneyEvent(
      { name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" },
      { storage, isOnline: () => false, schedule: (run) => scheduled.push(run) },
    );

    expect(scheduled).toHaveLength(0);
    expect(peekJourneyQueue({ storage })).toHaveLength(1);
  });

  it("coalesces a burst of online enqueues into a single scheduled flush", () => {
    const storage = makeMemoryStorage();
    const scheduled: (() => void)[] = [];
    const opts = {
      storage,
      isOnline: () => true,
      schedule: (run: () => void) => scheduled.push(run),
    };

    enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, opts);
    enqueueJourneyEvent({ name: "merchant_selected", at: "2026-07-26T00:00:01.000Z" }, opts);
    enqueueJourneyEvent({ name: "recommendation_viewed", at: "2026-07-26T00:00:02.000Z" }, opts);

    expect(scheduled).toHaveLength(1);
    expect(peekJourneyQueue({ storage })).toHaveLength(3);
  });

  it("enqueue never throws when the scheduler itself blows up", () => {
    const storage = makeMemoryStorage();
    expect(() =>
      enqueueJourneyEvent(
        { name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" },
        {
          storage,
          isOnline: () => true,
          schedule: () => {
            throw new Error("no task queue");
          },
        },
      ),
    ).not.toThrow();
    expect(peekJourneyQueue({ storage })).toHaveLength(1);
  });

  it("keeps events queued when the server does not acknowledge the whole batch", async () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, { storage });
    // A rejected database insert reported as a resolved { inserted: 0 } must
    // never be mistaken for a successful flush.
    const send = vi.fn(async () => ({ inserted: 0 }));

    await flushJourneyQueue({ storage, send });

    expect(send).toHaveBeenCalledTimes(1);
    expect(peekJourneyQueue({ storage })).toHaveLength(1);
  });

  it("keeps events queued when the server acknowledges only part of the batch", async () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, { storage });
    enqueueJourneyEvent({ name: "merchant_selected", at: "2026-07-26T00:00:01.000Z" }, { storage });
    const send = vi.fn(async () => ({ inserted: 1, rejected: 0 }));

    await flushJourneyQueue({ storage, send });

    expect(peekJourneyQueue({ storage })).toHaveLength(2);
  });

  it("drains a batch the server fully accounts for, including validator rejections", async () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, { storage });
    enqueueJourneyEvent({ name: "merchant_selected", at: "2026-07-26T00:00:01.000Z" }, { storage });
    // One inserted, one permanently refused: retrying cannot help, so the
    // batch is fully accounted for and leaves the queue.
    const send = vi.fn(async () => ({ inserted: 1, rejected: 1 }));

    await flushJourneyQueue({ storage, send });

    expect(peekJourneyQueue({ storage })).toHaveLength(0);
  });

  it("swallows a flush failure silently and keeps events queued — never throws", async () => {
    const storage = makeMemoryStorage();
    enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, { storage });
    const send = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(flushJourneyQueue({ storage, send })).resolves.not.toThrow();
    expect(peekJourneyQueue({ storage })).toHaveLength(1);
  });

  it("enqueue never throws even when storage.setItem blows up", () => {
    const storage = makeMemoryStorage();
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(() =>
      enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }, { storage }),
    ).not.toThrow();
  });

  it("defaults to localStorage when no storage is injected", () => {
    // Just proves the call shape works without an explicit storage — jsdom's
    // localStorage backs it in this test environment.
    expect(() =>
      enqueueJourneyEvent({ name: "wallet_ready", at: "2026-07-26T00:00:00.000Z" }),
    ).not.toThrow();
  });
});
