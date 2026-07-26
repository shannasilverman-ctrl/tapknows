// Journey instrumentation.
//
// The customer-experience report asks for two loops to be instrumented: the
// decision funnel (does a customer get from "where am I paying" to an actual
// payment choice?) and the learning loop (do they come back to understand
// their cards?). Both are named here, in one place, so a surface cannot
// silently invent an event name that no dashboard is watching for.
//
// Emission is observable, not assumed: every tracked event lands in a sink a
// test can read back, in-process for unit tests and on `window` for e2e.

const SINK_KEY = "__tapJourneyEvents";

/** The decision funnel: merchant → recommendation → proof → choice. */
export const DECISION_FUNNEL_EVENTS = [
  "wallet_ready",
  "merchant_selected",
  "recommendation_viewed",
  "proof_opened",
  "payment_choice_recorded",
] as const;

/** The learning loop: coming back to understand the wallet itself. */
export const LEARNING_LOOP_EVENTS = [
  "wallet_opened",
  "situation_tried",
  "card_guide_opened",
  "benefit_detail_opened",
] as const;

export const JOURNEY_EVENTS = [...DECISION_FUNNEL_EVENTS, ...LEARNING_LOOP_EVENTS] as const;

export type DecisionFunnelEvent = (typeof DECISION_FUNNEL_EVENTS)[number];
export type LearningLoopEvent = (typeof LEARNING_LOOP_EVENTS)[number];
export type JourneyEvent = (typeof JOURNEY_EVENTS)[number];

export type JourneyRecord = {
  name: JourneyEvent;
  props?: Record<string, unknown>;
  at: string;
};

const KNOWN = new Set<string>(JOURNEY_EVENTS);

/** Whether a string is one of the canonical journey event names. */
export function isJourneyEvent(name: string): name is JourneyEvent {
  return KNOWN.has(name);
}

// In-process sink. On the client the same array is also hung off `window` so
// a Playwright test can read it back after driving a real surface.
let sink: JourneyRecord[] = [];

function bindWindowSink(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  const existing = w[SINK_KEY];
  if (Array.isArray(existing)) {
    // A sink placed by a test before hydration wins — keep its identity so the
    // test's own reference keeps receiving records.
    sink = existing as JourneyRecord[];
    return;
  }
  w[SINK_KEY] = sink;
}

bindWindowSink();

/**
 * Record a journey event.
 *
 * Only canonical names are accepted — an unknown name is ignored and reported,
 * never recorded, so a typo cannot masquerade as funnel data.
 */
export function trackJourneyEvent(
  name: string,
  props?: Record<string, unknown>,
  now = new Date(),
): boolean {
  if (!isJourneyEvent(name)) {
    if (typeof console !== "undefined") {
      console.warn(`[journey] ignored unknown event name: ${name}`);
    }
    return false;
  }
  bindWindowSink();
  sink.push({ name, ...(props ? { props } : {}), at: now.toISOString() });
  return true;
}

/** Every event recorded so far, in order. */
export function readJourneyEvents(): JourneyRecord[] {
  bindWindowSink();
  return [...sink];
}

/** Whether a given event has been recorded at least once. */
export function hasJourneyEvent(name: JourneyEvent): boolean {
  return readJourneyEvents().some((r) => r.name === name);
}

/** Drop everything recorded — for test isolation. */
export function resetJourneyEvents(): void {
  sink.length = 0;
  if (typeof window !== "undefined") {
    const w = window as unknown as Record<string, unknown>;
    if (Array.isArray(w[SINK_KEY])) (w[SINK_KEY] as unknown[]).length = 0;
    else w[SINK_KEY] = sink;
  }
}

/** The window key the e2e suite reads the sink back from. */
export const JOURNEY_SINK_KEY = SINK_KEY;
