export type JourneyFunnelRow = {
  client_id: string;
  name: string;
  [key: string]: unknown;
};

const JOURNEY_FUNNEL_STEPS = [
  "wallet_ready",
  "merchant_selected",
  "recommendation_viewed",
  "proof_opened",
  "payment_choice_recorded",
] as const;

export function computeJourneyFunnel(
  rows: JourneyFunnelRow[],
): { step: string; count: number; dropOff: number | null }[] {
  const clientsByStep = new Map<string, Set<string>>(
    JOURNEY_FUNNEL_STEPS.map((step) => [step, new Set<string>()]),
  );

  for (const row of rows) {
    clientsByStep.get(row.name)?.add(row.client_id);
  }

  return JOURNEY_FUNNEL_STEPS.map((step, index) => {
    const count = clientsByStep.get(step)!.size;
    const previousCount =
      index === 0 ? null : clientsByStep.get(JOURNEY_FUNNEL_STEPS[index - 1])!.size;

    return {
      step,
      count,
      dropOff:
        previousCount === null || previousCount === 0
          ? null
          : Math.max(0, 1 - count / previousCount),
    };
  });
}
