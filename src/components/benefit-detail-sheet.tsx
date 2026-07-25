import { Sheet } from "@/components/sheet";
import type { CardBenefit } from "@/lib/benefits";

type Props = {
  benefit: CardBenefit | null;
  issuer: string;
  onClose: () => void;
};

/**
 * Bottom sheet showing the full terms of a standing protection/travel/
 * membership benefit. Reference only — no redemption actions, no progress.
 */
export function BenefitDetailSheet({ benefit, issuer, onClose }: Props) {
  const title = benefit?.title ?? benefit?.label ?? "";
  const verifiedOn = benefit?.verified_on;
  const sourceUrl = benefit?.source_url ?? benefit?.source;
  const verifiedLabel = verifiedOn
    ? new Date(`${verifiedOn}T00:00:00Z`).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Sheet open={!!benefit} onClose={onClose} title={title}>
      {benefit ? (
        <div className="space-y-4">
          {benefit.coverage_cap ? (
            <div className="rounded-2xl bg-secondary/60 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Coverage</p>
              <p className="mt-1 cs-money text-[15px] font-semibold text-foreground leading-snug">
                {benefit.coverage_cap}
              </p>
            </div>
          ) : null}
          {benefit.terms ? (
            <p className="text-[14px] leading-relaxed text-foreground">{benefit.terms}</p>
          ) : null}
          {(verifiedLabel || sourceUrl) && (
            <p className="text-[11px] text-muted-foreground leading-snug">
              {verifiedLabel ? `Verified ${verifiedLabel}` : "Verified"} · {issuer}
              {sourceUrl ? (
                <>
                  {" · "}
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
                  >
                    Source
                  </a>
                </>
              ) : null}
            </p>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
