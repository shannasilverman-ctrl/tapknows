import { Link } from "@tanstack/react-router";
import { CalendarDays, Info, Scale } from "lucide-react";
import { CardFace } from "@/components/card-face";
import { dollars } from "@/lib/format";
import type { Play } from "@/lib/planner";
import { describeRateAge } from "@/lib/rateAge";
import { isRateStale } from "@/lib/rateFreshness";

export type RecommendationProofProps = {
  winner: Play;
  runnerUp?: Play | null;
  amountCents: number;
  termsDate: string;
  valuationAssumption?: string;
  capStatus?: string;
  onEditAssumptions?: () => void;
  onReportIssue?: () => void;
  /**
   * Clock for the staleness consequence. Defaults to real time; tests pin it so
   * the stale branch is provable without waiting 90 days.
   */
  today?: Date;
};

function recommendationLabel(play: Play): string {
  const primary = play.legs[0].card;
  return play.kind === "split" ? `${primary.name} + ${play.legs[1].card.name}` : primary.name;
}

function earnLabel(play: Play): string {
  const leg = play.legs[0];
  const multiplier = leg.earnMultiplier;
  if (leg.rewardKind === "cashback" || multiplier < 1) {
    return `${Math.round(multiplier * 100)}% back on ${leg.matchedCategory.replace(/_/g, " ")}`;
  }
  return `${multiplier}× on ${leg.matchedCategory.replace(/_/g, " ")}`;
}

function valueEquation(play: Play): string {
  const equations = play.legs.map((leg) => {
    if (leg.rewardKind === "points") {
      return `${leg.pointsEarned.toLocaleString()} pts × ${(leg.cpp * 100).toFixed(
        2,
      )}¢ = est. ${dollars(leg.rewardsCents)}`;
    }
    if (leg.rewardKind === "cashback") {
      return `${dollars(leg.amountCents)} × ${(leg.earnMultiplier * 100).toFixed(
        0,
      )}% = ${dollars(leg.rewardsCents)} cash back`;
    }
    return `${dollars(leg.rewardsCents)} estimated reward value`;
  });
  const rewardsTotal = play.legs.reduce((sum, leg) => sum + leg.rewardsCents, 0);
  if (rewardsTotal !== play.totalValueCents) {
    equations.push(`estimated total ${dollars(play.totalValueCents)}`);
  }
  return equations.join(" · ");
}

/**
 * Dedicated light proof surface.
 *
 * All financial outputs are read directly from the recommendation engine's
 * Play objects. This component presents values; it never recalculates them.
 */
export function RecommendationProof({
  winner,
  runnerUp,
  amountCents,
  termsDate,
  valuationAssumption = "Uses TAP's default point values unless you set your own",
  capStatus = "Bonus rates assume cap room remains unless you marked a cap reached",
  onEditAssumptions,
  onReportIssue,
  today,
}: RecommendationProofProps) {
  const hasRunnerUp = !!runnerUp && runnerUp.id !== winner.id;
  const delta = hasRunnerUp ? winner.totalValueCents - runnerUp!.totalValueCents : 0;
  // One clock for both reads, so the branch and the label can never disagree.
  const now = today ?? new Date();
  const ratesAreStale = isRateStale(termsDate, now);
  const rateAge = describeRateAge(termsDate, now);

  return (
    <section className="tap-recommendation-proof" aria-label="Recommendation proof">
      <p className="tap-proof-purchase">On a {dollars(amountCents)} purchase</p>

      <div className="tap-proof-comparison">
        <ProofRow play={winner} winner />
        {hasRunnerUp && runnerUp ? (
          <ProofRow play={runnerUp} />
        ) : (
          <p className="tap-proof-no-runner">There isn't another card in this wallet to compare.</p>
        )}
      </div>

      {delta > 0 ? (
        <div className="tap-proof-value-difference">
          <span>Estimated difference</span>
          <strong>= {dollars(delta)}</strong>
        </div>
      ) : null}

      <dl className="tap-proof-disclosure">
        <div>
          <dt>
            <CalendarDays aria-hidden />
            Rates verified
          </dt>
          <dd>
            {ratesAreStale ? <span className="text-muted-foreground">{rateAge}</span> : rateAge}
          </dd>
        </div>
        <div>
          <dt>
            <Scale aria-hidden />
            Valuation
          </dt>
          <dd>{valuationAssumption}</dd>
        </div>
        <div>
          <dt>
            <Info aria-hidden />
            Caps and credits
          </dt>
          <dd>{capStatus}</dd>
        </div>
      </dl>

      <div className="tap-proof-corrections">
        {onEditAssumptions ? (
          <button type="button" onClick={onEditAssumptions}>
            Edit assumptions
          </button>
        ) : (
          <Link to="/settings">Edit assumptions</Link>
        )}
        {onReportIssue ? (
          <button type="button" onClick={onReportIssue}>
            Report an issue
          </button>
        ) : (
          <a href="mailto:hello@tapknows.com?subject=TAP recommendation issue">Report an issue</a>
        )}
      </div>

      <div className="tap-proof-independence">
        <p>TAP never recommends a card because it pays us.</p>
        <p>If you carry a balance, interest can cost more than the rewards shown here.</p>
      </div>
    </section>
  );
}

function ProofRow({ play, winner = false }: { play: Play; winner?: boolean }) {
  return (
    <article className="tap-proof-engine-row" data-winner={winner ? "true" : "false"}>
      <div className="tap-proof-engine-card">
        <CardFace
          issuer={play.legs[0].card.issuer}
          name={recommendationLabel(play)}
          variant={winner ? "winner" : "proof"}
        />
      </div>
      <div>
        <h3>{recommendationLabel(play)}</h3>
        <p>{earnLabel(play)}</p>
        <small>{valueEquation(play)}</small>
      </div>
      <strong>{dollars(play.totalValueCents)}</strong>
    </article>
  );
}
