import { useEffect, useState } from "react";
import { BRAND_NAME } from "@/lib/brand";

type Size = "sm" | "md" | "lg";

const sizeClass: Record<Size, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
};

/**
 * TAP wordmark: uppercase display face at weight 800 with a gold contactless
 * pulse in place of the accent dot. Arcs ripple outward from the gold dot
 * once on load (~600ms) and again on hover/focus. Never loops.
 * Under prefers-reduced-motion the arcs render statically at low opacity.
 */
export function Wordmark({ size = "md", className = "" }: { size?: Size; className?: string }) {
  const [playToken, setPlayToken] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => setPlayToken((n) => n + 1), 600);
    return () => window.clearTimeout(t);
  }, [reduced]);

  const replay = () => {
    if (reduced) return;
    setPlayToken((n) => n + 1);
  };

  return (
    <span
      className={`font-display font-extrabold uppercase tracking-tight leading-none inline-flex items-center ${sizeClass[size]} ${className} rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
      tabIndex={0}
      onMouseEnter={replay}
      onFocus={replay}
    >
      <span className="text-foreground">{BRAND_NAME}</span>
      <TapPulse token={playToken} reduced={reduced} />
    </span>
  );
}

function TapPulse({ token, reduced }: { token: number; reduced: boolean }) {
  // Fixed 1em square keeps the header layout stable regardless of arc scale.
  return (
    <span
      aria-hidden
      className="relative inline-block align-baseline ml-[0.15em] overflow-visible"
      style={{ width: "1em", height: "1em" }}
    >
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 w-full h-full overflow-visible"
        fill="none"
        stroke="hsl(41 62% 52%)"
      >
        {/* Gold dot: the brand accent, always visible */}
        <circle cx="20" cy="26" r="3.2" fill="hsl(41 62% 52%)" stroke="none" />
        {/* Concentric NFC-style arcs, rippling outward from the dot */}
        {[0, 1, 2].map((i) => {
          const r = 7 + i * 5;
          const d = `M ${20 - r * 0.55} ${26 - r * 0.83} A ${r} ${r} 0 0 1 ${20 - r * 0.55} ${26 + r * 0.83}`;
          return (
            <path
              key={reduced ? `static-${i}` : `${token}-${i}`}
              d={d}
              strokeWidth={2.2}
              strokeLinecap="round"
              className={reduced ? "" : "cs-tap-arc"}
              style={
                reduced
                  ? { opacity: 0.32 }
                  : {
                      opacity: 0,
                      animationDelay: `${i * 150}ms`,
                      transformOrigin: "20px 26px",
                      transformBox: "view-box",
                    }
              }
            />
          );
        })}
      </svg>
    </span>
  );
}
