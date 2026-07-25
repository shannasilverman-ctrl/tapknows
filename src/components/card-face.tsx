import { issuerFaceClass } from "@/lib/cardFace";

type Props = {
  issuer: string;
  name: string;
  variant?: "default" | "winner";
  /** Optional card-face bottom-row trailing content (e.g. a small $ value). */
  trailing?: React.ReactNode;
  /** Last four of the card. If omitted, derived deterministically from name+issuer. */
  last4?: string;
  /** Cardholder line (spaced caps). Defaults to "TAP MEMBER". */
  holder?: string;
  className?: string;
};

/**
 * Realistic credit-card face at 1.586:1 (the parent sets the aspect box).
 * Anatomy, top→bottom:
 *   • issuer wordmark top-left, contactless wave glyph top-right
 *   • EMV chip mid-left
 *   • masked number line with tabular last four
 *   • cardholder in spaced capitals bottom-left, product name bottom-right
 * No real logos, no network marks — typographic only.
 */
export function CardFace({
  issuer,
  name,
  variant = "default",
  trailing,
  last4,
  holder,
  className,
}: Props) {
  const tint =
    variant === "winner" ? "cs-face--winner cs-face--metal" : issuerFaceClass(issuer, name);
  const digits = last4 ?? deriveLast4(`${issuer}:${name}`);
  const holderLine = (holder ?? "TAP MEMBER").toUpperCase();
  return (
    <div className={`cs-face ${tint} ${className ?? ""}`}>
      <div className="absolute inset-0 flex flex-col p-[6%]">
        {/* Row 1 — issuer wordmark + contactless glyph */}
        <div className="flex items-start justify-between gap-3">
          <p className="cs-face-wordmark">{issuer}</p>
          <ContactlessGlyph />
        </div>

        {/* Row 2 — chip */}
        <div className="mt-[6%]">
          <div className="cs-chip" aria-hidden />
        </div>

        {/* Row 3 — masked number line */}
        <div className="mt-auto">
          <p className="cs-face-number">
            <span aria-hidden>•••• •••• •••• </span>
            <span className="cs-face-last4">{digits}</span>
          </p>

          {/* Row 4 — holder + product */}
          <div className="mt-[3%] flex items-end justify-between gap-3">
            <p className="cs-face-holder">{holderLine}</p>
            <p className="cs-face-product">{name}</p>
          </div>

          {trailing ? (
            <div className="mt-[3%] flex justify-end">
              <div className="cs-face-trailing">{trailing}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Contactless payment wave — three arcs, purely decorative. */
function ContactlessGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="cs-face-wave" aria-hidden focusable="false">
      <path
        d="M6 8c2.5 2 2.5 6 0 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M10 6c3.5 2.6 3.5 9.4 0 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M14 4c4.5 3.2 4.5 12.8 0 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Deterministic 4-digit string from a seed (visual filler only, not sensitive). */
function deriveLast4(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const n = h % 10000;
  return n.toString().padStart(4, "0");
}
