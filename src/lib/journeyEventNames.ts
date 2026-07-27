// The canonical journey event vocabulary — a leaf module with NO imports.
//
// The names and the predicate live here rather than beside the sink in
// `journeyEvents.ts` for one structural reason: everything downstream of the
// sink needs to know whether a name is canonical. The durable queue
// (`journeyQueue.ts`) and the ingest validator (`journeyIngest.ts`) both do,
// and both are imported BY `journeyEvents.ts`. Asking them to import the
// predicate back from `journeyEvents.ts` closed an import cycle, and a cycle
// means whichever module the bundle enters first can call `isJourneyEvent`
// while its backing set is still uninitialized. That is not theoretical: the
// queue's reload-time flush ran during module evaluation, hit exactly that
// window, and had the resulting initialization error swallowed by its own
// silent-failure catch — a persisted offline queue that never left the device.
//
// A dependency-free leaf cannot participate in a cycle. Anything that imports
// it is guaranteed to see it fully evaluated.

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

const KNOWN = new Set<string>(JOURNEY_EVENTS);

/** Whether a string is one of the canonical journey event names. */
export function isJourneyEvent(name: string): name is JourneyEvent {
  return KNOWN.has(name);
}
