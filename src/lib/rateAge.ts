import { RATE_FRESHNESS_WINDOW_DAYS, isRateStale } from "./rateFreshness";

/**
 * The customer-facing consequence of rate staleness — honest, and snapshot-safe.
 *
 * The fresh path returns the `verifiedOn` string EXACTLY as given: byte-identical
 * to what the proof surface renders today, so the existing visual snapshots hold
 * unchanged while rates are current. Only the stale path adds words, and when it
 * does it names the date the customer is trusting and how old it is.
 */
export function describeRateAge(verifiedOn: string, today: Date = new Date()): string {
  if (!isRateStale(verifiedOn, today)) return verifiedOn;

  return `These rates were last verified on ${verifiedOn} and are more than ${RATE_FRESHNESS_WINDOW_DAYS} days old.`;
}
