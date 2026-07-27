const DAY_MS = 24 * 60 * 60 * 1000;

export const RATE_FRESHNESS_WINDOW_DAYS = 90;

export function isRateStale(verifiedOn: string, today: Date = new Date()): boolean {
  const verifiedAt = new Date(`${verifiedOn}T00:00:00.000Z`);
  const elapsedDays = Math.floor((today.getTime() - verifiedAt.getTime()) / DAY_MS);

  return elapsedDays > RATE_FRESHNESS_WINDOW_DAYS;
}
