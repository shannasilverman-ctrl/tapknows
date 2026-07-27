// The canonical vocabulary comes from the dependency-free leaf, never from
// `journeyEvents.ts`. `journeyEvents.ts` imports THIS module, so importing the
// predicate back from it closed a cycle: on a real reload the bundle enters
// through `journeyEvents.ts`, evaluates this module to the bottom, and the
// reload-time flush below called `isJourneyEvent` before the sink module had
// finished initializing it. The resulting error was swallowed by the flush's
// own silent-failure catch, so a queue persisted while offline or signed out
// never left the device.
import { isJourneyEvent, type JourneyEvent } from "./journeyEventNames";
import { ingestJourneyEvents } from "./journey.functions";

const QUEUE_KEY = "tap.journeyQueue.v1";
const CLIENT_ID_KEY = "tap.journeyQueue.clientId.v1";

type JourneyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StorageOptions = {
  storage?: JourneyStorage;
};

/**
 * Enqueue options. `schedule` and `isOnline` exist so the post-enqueue flush
 * is drivable from a test without a browser; production uses the defaults.
 */
type EnqueueOptions = StorageOptions & {
  schedule?: (run: () => void) => void;
  isOnline?: () => boolean;
};

export type QueuedEvent = {
  name: JourneyEvent;
  at: string;
  props?: Record<string, unknown>;
};

function resolveStorage(storage?: JourneyStorage): JourneyStorage | undefined {
  if (storage) return storage;
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toQueuedEvent(value: unknown): QueuedEvent | null {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    !isJourneyEvent(value.name) ||
    typeof value.at !== "string"
  ) {
    return null;
  }

  return {
    name: value.name,
    at: value.at,
    ...(isRecord(value.props) ? { props: value.props } : {}),
  };
}

function readQueue(storage: JourneyStorage): QueuedEvent[] {
  try {
    const raw = storage.getItem(QUEUE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const event = toQueuedEvent(value);
      return event ? [event] : [];
    });
  } catch {
    return [];
  }
}

/** Browser default: only a real, currently-online window schedules a flush. */
function defaultIsOnline(): boolean {
  if (typeof window === "undefined") return false;
  return typeof navigator !== "undefined" && navigator.onLine === true;
}

/** Browser default: hand the flush to the task queue so emit never blocks. */
function defaultSchedule(run: () => void): void {
  setTimeout(run, 0);
}

let flushPending = false;

/**
 * Fire-and-forget: after a successful enqueue on an online session, hand the
 * queue to the server on a later task. Never runs on the synchronous emit
 * path, never throws, and coalesces so a burst of events sends one batch.
 */
function scheduleFlush(opts?: EnqueueOptions): void {
  const isOnline = opts?.isOnline ?? defaultIsOnline;
  const schedule = opts?.schedule ?? defaultSchedule;
  try {
    if (!isOnline()) return;
    if (flushPending) return;
    flushPending = true;
    schedule(() => {
      flushPending = false;
      void flushJourneyQueue(opts?.storage ? { storage: opts.storage } : {}).catch(() => {});
    });
  } catch {
    flushPending = false;
  }
}

export function enqueueJourneyEvent(
  event: { name: string; at: string; props?: Record<string, unknown> },
  opts?: EnqueueOptions,
): void {
  if (!isJourneyEvent(event.name)) return;
  const storage = resolveStorage(opts?.storage);
  if (!storage) return;

  const queuedEvent: QueuedEvent = {
    name: event.name,
    at: event.at,
    ...(event.props ? { props: event.props } : {}),
  };

  try {
    storage.setItem(QUEUE_KEY, JSON.stringify([...readQueue(storage), queuedEvent]));
  } catch {
    return;
  }

  scheduleFlush(opts);
}

export function peekJourneyQueue(opts?: StorageOptions): QueuedEvent[] {
  const storage = resolveStorage(opts?.storage);
  return storage ? readQueue(storage) : [];
}

function createGuestClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getGuestClientId(opts?: StorageOptions): string {
  const storage = resolveStorage(opts?.storage);
  if (storage) {
    try {
      const existing = storage.getItem(CLIENT_ID_KEY);
      if (existing) return existing;
    } catch {}
  }

  const id = createGuestClientId();
  if (storage) {
    try {
      storage.setItem(CLIENT_ID_KEY, id);
    } catch {}
  }
  return id;
}

/**
 * A flush only earns the right to delete events when the server explicitly
 * accounts for every event in the submitted batch: `inserted` plus any
 * `rejected` (records the ingress refused as invalid, which no retry can fix)
 * must equal what was sent. Anything else — a rejected insert reported as
 * `{ inserted: 0 }`, a partial write, an unrecognised acknowledgment — leaves
 * the batch queued for the next flush.
 */
function isFullBatchAck(result: unknown, sent: number): boolean {
  if (typeof result !== "object" || result === null) return false;
  const { inserted, rejected } = result as { inserted?: unknown; rejected?: unknown };
  if (typeof inserted !== "number") return false;
  return inserted + (typeof rejected === "number" ? rejected : 0) === sent;
}

/**
 * Remove exactly the batch this flush submitted, and only if it is still the
 * head of the queue.
 *
 * Enqueues only ever append, and the flush chain guarantees no other drain
 * consumed anything while this one was in flight, so an acknowledged batch is
 * still the queue's head. Verifying that before slicing is what stops an
 * acknowledgment from ever costing an event it did not carry: if storage was
 * rewritten underneath us, nothing is dropped and the events flush next time.
 */
function removeAcknowledgedBatch(storage: JourneyStorage, sent: QueuedEvent[]): void {
  const current = readQueue(storage);
  const sentIsStillHead =
    current.length >= sent.length &&
    sent.every((event, i) => current[i].name === event.name && current[i].at === event.at);
  if (!sentIsStillHead) return;
  storage.setItem(QUEUE_KEY, JSON.stringify(current.slice(sent.length)));
}

async function drainJourneyQueue(
  opts: StorageOptions & {
    send?: (batch: { client_id: string; events: unknown[] }) => Promise<unknown>;
  },
): Promise<void> {
  try {
    const storage = resolveStorage(opts.storage);
    if (!storage) return;

    const events = readQueue(storage);
    if (events.length === 0) return;

    const send =
      opts.send ??
      ((batch: { client_id: string; events: unknown[] }) =>
        ingestJourneyEvents({
          data: {
            client_id: batch.client_id,
            events: batch.events as QueuedEvent[],
          },
        }));

    const ack = await send({
      client_id: getGuestClientId(opts),
      events,
    });

    // No explicit full-batch acknowledgment: the events stay durable. Losing
    // them here would be silent data loss dressed up as a successful flush.
    if (!isFullBatchAck(ack, events.length)) return;

    removeAcknowledgedBatch(storage, events);
  } catch {}
}

/**
 * One drain at a time, for every caller.
 *
 * Flushes arrive from four places — a scheduled post-enqueue send, module
 * initialization on reload, the `online` event, and direct test calls — and
 * the coalescing latch covered only the first. Overlapping drains each
 * snapshotted the queue independently, so a later acknowledgment could delete
 * events that no flush had ever submitted (snapshot [A], then [A,B], with C
 * appended in between: whichever ack landed second removed C unsent). Chaining
 * every invocation through one in-flight drain means each acknowledgment can
 * only ever account for the batch it actually sent, and the next drain re-reads
 * what is genuinely left.
 *
 * The returned promise never rejects — `drainJourneyQueue` swallows everything,
 * so fire-and-forget callers stay fire-and-forget.
 */
let flushChain: Promise<void> = Promise.resolve();

export function flushJourneyQueue(
  opts: StorageOptions & {
    send?: (batch: { client_id: string; events: unknown[] }) => Promise<unknown>;
  },
): Promise<void> {
  const next = flushChain.then(() => drainJourneyQueue(opts));
  flushChain = next;
  return next;
}

export function __resetJourneyQueueForTest(): void {
  // Queue and client state intentionally live only in storage; the in-module
  // state is the flush-coalescing latch and the serialized drain chain.
  flushPending = false;
  flushChain = Promise.resolve();
}

if (typeof window !== "undefined") {
  const flush = () => {
    void flushJourneyQueue({}).catch(() => {});
  };
  // Deferred to a later task on purpose. Running the reload flush during module
  // evaluation reaches back into modules that are still initializing, and any
  // error there is swallowed by the flush's own catch — the queue would look
  // fine and simply never send. Handing it to the task queue means the whole
  // module graph is evaluated before the first byte of a persisted queue moves.
  defaultSchedule(flush);
  window.addEventListener("online", flush);
}
