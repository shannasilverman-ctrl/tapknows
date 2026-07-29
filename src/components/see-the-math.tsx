import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Play } from "@/lib/planner";
import { dollars } from "@/lib/format";
import { RATES_VERIFIED_ON } from "@/lib/cardCatalog";
import { Sheet } from "@/components/sheet";
import { RecommendationProof } from "@/components/recommendation-proof";
import { trackJourneyEvent } from "@/lib/journeyEvents";

type Props = {
  winner: Play;
  runnerUp?: Play | null;
  amountCents: number;
  /** Allowlisted funnel context — slugs only, never amounts. */
  merchant?: string | null;
  category?: string | null;
  valuationAssumption?: string;
  capStatus?: string;
  capBadge?: string | null;
  onEditAssumptions?: () => void;
  onReportIssue?: () => void;
};

function recommendationLabel(play: Play): string {
  const primary = play.legs[0].card;
  return play.kind === "split" ? `${primary.name} + ${play.legs[1].card.name}` : primary.name;
}

/**
 * Opens the dedicated proof sheet for an engine-produced recommendation.
 * The closed state stays compact inside the dark decision moment; the proof
 * itself owns a full light surface instead of expanding an accordion in place.
 */
export function SeeTheMath({
  winner,
  runnerUp,
  amountCents,
  merchant,
  category,
  valuationAssumption,
  capStatus,
  capBadge,
  onEditAssumptions,
  onReportIssue,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasRunnerUp = !!runnerUp && runnerUp.id !== winner.id;
  const delta = hasRunnerUp ? winner.totalValueCents - runnerUp!.totalValueCents : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Decision funnel step 4: the customer actually opened the proof.
          trackJourneyEvent("proof_opened", {
            ...(merchant ? { merchant } : {}),
            ...(category ? { category } : {}),
          });
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="tap-proof-trigger tap-stage tap-decision-proof"
      >
        <span>
          <strong>Why {recommendationLabel(winner)}?</strong>
          <small>
            {delta > 0
              ? `vs ${recommendationLabel(runnerUp!)}: est. ${dollars(
                  runnerUp!.totalValueCents,
                )} · +${dollars(delta)}`
              : "See the estimated reward math and assumptions"}
          </small>
          {capBadge ? <em className="tap-proof-cap-badge">{capBadge}</em> : null}
        </span>
        <ChevronRight aria-hidden />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Why ${recommendationLabel(winner)}?`}
        panelClassName="tap-proof-sheet"
      >
        <RecommendationProof
          winner={winner}
          runnerUp={runnerUp}
          amountCents={amountCents}
          termsDate={RATES_VERIFIED_ON}
          valuationAssumption={valuationAssumption}
          capStatus={capStatus}
          onEditAssumptions={onEditAssumptions}
          onReportIssue={onReportIssue}
        />
      </Sheet>
    </>
  );
}
