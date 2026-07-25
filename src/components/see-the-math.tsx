import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Play } from "@/lib/planner";
import { dollars } from "@/lib/format";

type Props = {
  /** The play the user is looking at (raised card). Engine-computed. */
  winner: Play;
  /** The next-best play from the engine's sorted output, if any. */
  runnerUp?: Play | null;
  /** Charge amount in cents, from the current decide context. */
  amountCents: number;
};

function playLabel(p: Play): string {
  const primary = p.legs[0].card;
  return p.kind === "split" ? `${primary.name} + ${p.legs[1].card.name}` : primary.name;
}

function earnLabel(p: Play): string {
  // Read straight off the engine's leg — do not recompute.
  const leg = p.legs[0];
  const m = leg.earnMultiplier;
  if (leg.rewardKind === "cashback" || m < 1) {
    return `${Math.round(m * 100)}% back on ${leg.matchedCategory.replace(/_/g, " ")}`;
  }
  return `${m}× on ${leg.matchedCategory.replace(/_/g, " ")}`;
}

/**
 * Collapsible proof panel for the recommendation result.
 *
 * Uses ONLY engine-produced values (Play.totalValueCents, leg.earnMultiplier,
 * leg.matchedCategory). Does not recompute, does not invent numbers.
 * Falls back to winner-only when runner-up is unavailable.
 */
export function SeeTheMath({ winner, runnerUp, amountCents }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const hasRunnerUp = !!runnerUp && runnerUp.id !== winner.id;
  const delta = hasRunnerUp ? winner.totalValueCents - runnerUp!.totalValueCents : 0;

  return (
    <div className="tap-proof-panel mt-4 rounded-2xl bg-white border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] text-left hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors"
      >
        <span className="text-[14px] font-medium text-foreground">See the math</span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <div
        id={id}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="tap-proof-content px-4 pb-4 pt-1 border-t border-border/70 space-y-3">
            <h2 className="tap-proof-title">Why {playLabel(winner)}?</h2>
            <p className="cs-microlabel text-[10px]">On {dollars(amountCents)}</p>

            <div className="tap-proof-card flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Winner
                </p>
                <p className="mt-0.5 text-[14px] text-foreground font-medium truncate">
                  {playLabel(winner)}
                </p>
                <p className="text-[12px] text-muted-foreground">{earnLabel(winner)}</p>
              </div>
              <p className="cs-money text-[16px] text-foreground tabular-nums whitespace-nowrap">
                {dollars(winner.totalValueCents)}
              </p>
            </div>

            {hasRunnerUp && runnerUp ? (
              <>
                <div className="tap-proof-card flex items-baseline justify-between gap-3 opacity-80">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      Runner-up
                    </p>
                    <p className="mt-0.5 text-[14px] text-foreground truncate">
                      {playLabel(runnerUp)}
                    </p>
                    <p className="text-[12px] text-muted-foreground">{earnLabel(runnerUp)}</p>
                  </div>
                  <p className="cs-money text-[15px] text-foreground tabular-nums whitespace-nowrap">
                    {dollars(runnerUp.totalValueCents)}
                  </p>
                </div>
                {delta > 0 && (
                  <div className="tap-proof-delta pt-2 border-t border-border/70 flex items-baseline justify-between gap-3">
                    <p className="text-[12px] text-muted-foreground">Estimated difference</p>
                    <p className="cs-money text-[16px] text-foreground tabular-nums whitespace-nowrap">
                      {dollars(delta)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                No other card in your wallet earns on this purchase.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
