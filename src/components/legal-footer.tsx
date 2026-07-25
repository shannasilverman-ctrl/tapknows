import { Link } from "@tanstack/react-router";

/**
 * Universal legal footer with independence disclosure + Privacy/Terms links.
 * Rendered on every page (landing has its own richer footer that also
 * includes these facts).
 */
export function LegalFooter({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`w-full ${
        compact ? "px-5 py-3" : "px-5 py-6"
      } max-w-md mx-auto text-[10px] leading-relaxed text-muted-foreground`}
    >
      <p>
        TAP is an independent product, not affiliated with or endorsed by Apple, any card issuer, or
        any payment network. Card names are trademarks of their respective owners.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Link to="/privacy" className="hover:text-foreground transition-colors">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link to="/terms" className="hover:text-foreground transition-colors">
          Terms
        </Link>
        <span aria-hidden>·</span>
        <span>tapknows.com</span>
      </div>
    </div>
  );
}
