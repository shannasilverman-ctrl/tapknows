import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  panelClassName?: string;
  /**
   * When true, all dismissal paths (scrim tap, Escape, drag-down) are
   * suppressed. Use while a primary action is in flight so the sheet can't
   * be dismissed mid-save/mid-remove.
   */
  busy?: boolean;
};

const DRAG_CLOSE_PX = 96;
const DRAG_CLOSE_VELOCITY = 0.6; // px/ms

/**
 * iOS-style bottom sheet. Slides up with a spring, dimmed scrim,
 * grabber on top. Closes on scrim-click, Escape, or a drag-down that
 * passes either the distance or the velocity threshold. Dragging up
 * rubber-bands. Respects prefers-reduced-motion via CSS.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  busy = false,
  panelClassName = "",
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: number;
    startY: number;
    startT: number;
    lastY: number;
    lastT: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setDragY(null);
    } else if (mounted) {
      setClosing(true);
      const t = window.setTimeout(() => {
        setMounted(false);
        setDragY(null);
      }, 260);
      return () => window.clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
      // aria-modal promises assistive tech that focus stays inside; nothing
      // enforced it, so Tab walked straight out into the dimmed page behind.
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus in on open, and put it back where the customer was on close —
    // a keyboard user should never be left focused on a hidden page.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) {
      const target = panel.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (target ?? panel).focus();
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [mounted, onClose, busy]);

  const tryClose = () => {
    if (busy) return;
    onClose();
  };

  const onGrabberPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: e.pointerId,
      startY: e.clientY,
      startT: performance.now(),
      lastY: e.clientY,
      lastT: performance.now(),
    };
    setDragY(0);
  };

  const onGrabberPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const raw = e.clientY - d.startY;
    // Rubber-band upward drag: 0.35x with soft cap.
    const y = raw >= 0 ? raw : -Math.pow(-raw, 0.7) * 0.35;
    d.lastY = e.clientY;
    d.lastT = performance.now();
    setDragY(y);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    const dt = Math.max(1, performance.now() - d.lastT);
    const vy = (e.clientY - d.lastY) / dt;
    dragRef.current = null;
    if (!busy && (dy > DRAG_CLOSE_PX || vy > DRAG_CLOSE_VELOCITY)) {
      onClose();
    } else {
      // Spring back to rest
      setDragY(null);
    }
  };

  if (!mounted || typeof document === "undefined") return null;

  const state = closing ? "closing" : "open";
  const panelStyle: React.CSSProperties =
    dragY !== null
      ? {
          transform: `translateY(${Math.max(dragY, -24)}px)`,
          transition: "none",
          animation: "none",
        }
      : {
          // Spring back after release
          transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        };

  return createPortal(
    <>
      <div className="cs-sheet-scrim" data-state={state} onClick={tryClose} aria-hidden />
      <div
        ref={panelRef}
        className={`cs-sheet-panel cs-app-body ${panelClassName}`.trim()}
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Focusable as a last resort, so opening a sheet with no interactive
        // children still moves focus inside the dialog.
        tabIndex={-1}
        style={panelStyle}
      >
        <div
          className="cs-sheet-drag-handle"
          onPointerDown={onGrabberPointerDown}
          onPointerMove={onGrabberPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="cs-sheet-grabber" aria-hidden />
        </div>
        <div className="cs-sheet-heading px-5 pt-1 pb-3">
          {title ? <p className="cs-title-md text-foreground">{title}</p> : <span />}
          <button
            type="button"
            className="cs-sheet-close"
            onClick={tryClose}
            disabled={busy}
            aria-label={title ? `Close ${title}` : "Close dialog"}
          >
            <X aria-hidden />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </>,
    document.body,
  );
}
