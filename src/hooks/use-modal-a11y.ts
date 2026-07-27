import { useEffect, useRef } from "react";

/**
 * Dialog semantics for the hand-rolled modals on /bonuses, /offers and
 * /purchases. Before this, all three were plain fixed-position divs: no
 * dialog role, no Escape, and focus stayed on the dimmed page behind — a
 * keyboard or screen-reader user could not tell a modal had opened at all.
 *
 * Spread {...modalProps} onto the panel element (not the scrim). The hook
 * moves focus in on mount, traps Tab inside, closes on Escape, and restores
 * focus to wherever the customer was when the modal closes.
 *
 * The full-blown alternative is rewriting these on <Sheet>, but that changes
 * their look (bottom sheet, grabber, spring) — this fixes the semantics
 * without touching the visuals.
 */
export function useModalA11y(onClose: () => void, label: string) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const focusables = () =>
      panel?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? ([] as unknown as NodeListOf<HTMLElement>);

    const initial = focusables();
    (initial.length > 0 ? initial[0] : panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panel) {
        const els = focusables();
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !panel.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    modalProps: {
      ref: panelRef,
      role: "dialog" as const,
      "aria-modal": true as const,
      "aria-label": label,
      tabIndex: -1,
    },
  };
}
