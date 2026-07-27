// Shared fixture for the staleness-consequence criteria (P-1..P-4).
//
// Renders the REAL RecommendationProof under a pinned stale pair — a pinned
// `verified on` date and a pinned clock more than the freshness window past it
// — so the stale branch is provable without waiting 90 days. Callbacks are
// supplied deliberately: they make the component render plain <button>s instead
// of router <Link>s, so the markup renders with no router context.

import { renderToStaticMarkup } from "react-dom/server";
import { RecommendationProof } from "@/components/recommendation-proof";
import type { Play, PlayLeg } from "@/lib/planner";
import type { CardCatalog } from "@/lib/types";

/** Pinned pair: 2026-01-01 verified, read on 2026-07-26 — 206 days, well past 90. */
export const PINNED_VERIFIED_ON = "2026-01-01";
export const PINNED_TODAY = new Date("2026-07-26T00:00:00.000Z");

/** A fresh pair, for the negative case: verified today, read today. */
export const PINNED_FRESH_ON = "2026-07-20";

const card = {
  id: "amex_gold",
  issuer: "American Express",
  name: "Amex Gold",
} as unknown as CardCatalog;

function leg(): PlayLeg {
  return {
    userCardId: "uc_1",
    card,
    nickname: null,
    amountCents: 10_000,
    earnMultiplier: 4,
    matchedCategory: "groceries",
    valueCents: 336,
    rewardsCents: 336,
    reasoning: "4x on groceries",
    rewardKind: "points",
    pointsEarned: 400,
    cpp: 0.84,
    programId: "mr",
  } as PlayLeg;
}

export function makePlay(): Play {
  return {
    id: "play_1",
    kind: "single",
    legs: [leg()],
    totalValueCents: 336,
    headline: "Use Amex Gold",
    programIdsUsed: ["mr"],
  };
}

/** Render the real component to static markup under an explicit clock. */
export function renderProof(termsDate: string, today: Date): string {
  return renderToStaticMarkup(
    <RecommendationProof
      winner={makePlay()}
      runnerUp={null}
      amountCents={10_000}
      termsDate={termsDate}
      today={today}
      onEditAssumptions={() => {}}
      onReportIssue={() => {}}
    />,
  );
}

/** The stale-pair markup every P-criterion asserts against. */
export function renderStaleProof(): string {
  return renderProof(PINNED_VERIFIED_ON, PINNED_TODAY);
}

/**
 * Extract the notice element's markup — the `<span>` inside the "Rates
 * verified" <dd>. Returns null when no notice was rendered.
 */
export function extractNotice(markup: string): string | null {
  const match = markup.match(/<span class="text-muted-foreground">[\s\S]*?<\/span>/);
  return match ? match[0] : null;
}
