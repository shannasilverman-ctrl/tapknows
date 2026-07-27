import { cn } from "@/lib/utils";

export type CardFace = {
  name: string;
  issuer: string;
  /** Optional program/currency label, e.g. "Ultimate Rewards". */
  program?: string | null;
  /** Optional amount routed to this card in a split play, in cents. */
  amountCents?: number;
};

type CardPlayProps = {
  cards: CardFace[];
  variant?: "gold" | "ink" | "ivory";
  className?: string;
  animate?: boolean;
};

function fmtCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function variantClass(v: NonNullable<CardPlayProps["variant"]>): string {
  if (v === "ivory") return "cs-cardstock cs-cardstock--ivory";
  if (v === "gold") return "cs-cardstock cs-cardstock--gold";
  return "cs-cardstock";
}

function CardFaceView({
  card,
  variant,
  className,
  animationClass,
}: {
  card: CardFace;
  variant: NonNullable<CardPlayProps["variant"]>;
  className?: string;
  animationClass?: string;
}) {
  const isDark = variant === "ink";
  const dim = isDark
    ? "text-[hsl(40_35%_92%/0.72)]"
    : variant === "gold"
      ? "text-[hsl(30_50%_18%/0.72)]"
      : "text-muted-foreground";
  const strong = isDark
    ? "text-[hsl(40_45%_97%)]"
    : variant === "gold"
      ? "text-[hsl(30_50%_14%)]"
      : "text-foreground";

  return (
    <div className={cn(variantClass(variant), animationClass, className)}>
      <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
        {/* top row: issuer + program */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("text-[9px] uppercase tracking-[0.18em] font-medium", dim)}>
              {card.issuer}
            </p>
            {card.program ? (
              <p className={cn("mt-0.5 text-[10px] tracking-wide", dim)}>{card.program}</p>
            ) : null}
          </div>
          <span
            aria-hidden
            className={cn(
              "font-display italic text-base sm:text-lg leading-none opacity-90",
              strong,
            )}
          >
            {/* The product's own mark. This read "cs" — the Card Savvy
                monogram the template shipped with — which meant the old brand
                was printed on a card face on tapknows.com. */}
            tap
          </span>
        </div>

        {/* chip */}
        <div className="cs-chip" aria-hidden />

        {/* bottom: card name + amount */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("text-[9px] uppercase tracking-[0.2em]", dim)}>Cardholder</p>
            <p
              className={cn(
                "font-display text-base sm:text-lg leading-tight tracking-tight truncate max-w-[10rem] sm:max-w-[14rem]",
                strong,
              )}
            >
              {card.name}
            </p>
          </div>
          {card.amountCents != null && (
            <div className="text-right shrink-0">
              <p className={cn("cs-microlabel text-[9px]", dim)}>Charge</p>
              <p
                className={cn(
                  "cs-money text-lg sm:text-xl leading-tight whitespace-nowrap",
                  strong,
                )}
              >
                {fmtCents(card.amountCents)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The signature TAP component. Renders a single physical-looking card,
 * or a fanned pair when a split play is recommended. Purely presentational —
 * pass hydrated card metadata + optional per-card charge amount in cents.
 */
export function CardPlay({ cards, variant = "gold", className, animate = true }: CardPlayProps) {
  if (cards.length === 0) return null;

  // Single card play
  if (cards.length === 1) {
    return (
      <div className={cn("relative w-full max-w-[26rem] mx-auto", className)}>
        {/* wallet stack behind */}
        <div
          aria-hidden
          className={cn("cs-cardstock w-[94%]", animate && "cs-wallet-back-3")}
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            transform: "translate(-50%, -18px) rotate(6deg) scale(0.94)",
            opacity: 0.32,
          }}
        />
        <div
          aria-hidden
          className={cn("cs-cardstock cs-cardstock--ivory w-[97%]", animate && "cs-wallet-back-2")}
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            transform: "translate(-50%, -10px) rotate(-5deg) scale(0.97)",
            opacity: 0.55,
          }}
        />
        <CardFaceView
          card={cards[0]}
          variant={variant}
          className={cn("w-full", animate && "cs-wallet-hero")}
        />
      </div>
    );
  }

  // Split (fanned) — up to two cards visible in the fan; extras collapse behind.
  const [primary, secondary, ...rest] = cards;
  return (
    <div className={cn("relative w-full max-w-[26rem] mx-auto", className)}>
      {rest.length > 0 && (
        <div
          aria-hidden
          className="cs-cardstock cs-cardstock--ivory w-[94%]"
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            transform: "translate(-50%, -14px) rotate(-8deg) scale(0.94)",
            opacity: 0.4,
          }}
        />
      )}
      <div
        className={cn(animate && "cs-wallet-hero-b")}
        style={{
          position: "absolute",
          inset: 0,
          transform: animate ? undefined : "translate(6%, 6%) rotate(9deg) scale(0.96)",
        }}
      >
        <CardFaceView card={secondary} variant="ivory" className="w-full" />
      </div>
      <div className={cn(animate && "cs-wallet-hero")}>
        <CardFaceView card={primary} variant={variant} className="w-full" />
      </div>
    </div>
  );
}
