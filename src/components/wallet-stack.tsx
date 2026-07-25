import { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { CardFace } from "@/components/card-face";

export type StackCard = {
  id: string;
  issuer: string;
  name: string;
  detail?: React.ReactNode;
  winner?: boolean;
  trailing?: React.ReactNode;
};

type Props = {
  cards: StackCard[];
  /** Peek strip height between cards in collapsed state (px). */
  peek?: number;
  onRaise?: (id: string) => void;
  onOpen?: (id: string) => void;
  raisedId?: string | null;
  enterFromStack?: boolean;
  /** Wrap the stack in TAP's woven leather pocket. */
  pocket?: boolean;
  /** Show the orange contactless signal around the raised card. */
  signal?: boolean;
  /** Quiet label embossed into the pocket. */
  pocketLabel?: string;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Apple-Wallet-style stack.
 *
 * COLLAPSED: raised card is anchored at the BOTTOM of the container at full
 * aspect ratio. Cards behind it stack UPWARD with a uniform peek offset;
 * each is a full card face with all four rounded corners, and its lower
 * portion is naturally hidden behind the card in front (no overflow clip),
 * so every peek reads as a real card, never a cut-off rectangle.
 *
 * EXPANDED: vertical drag on the stack spreads cards apart; release settles
 * (velocity-aware). In the spread, tap-to-raise brings a card to front and
 * collapses. Tapping the raised card opens detail. Spring physics; interruptible;
 * respects prefers-reduced-motion.
 */
export function WalletStack({
  cards,
  peek = 32,
  onRaise,
  onOpen,
  raisedId,
  enterFromStack = false,
  pocket = false,
  signal = false,
  pocketLabel,
}: Props) {
  const initial = useMemo(
    () => raisedId ?? cards.find((c) => c.winner)?.id ?? cards[0]?.id ?? null,
    [cards, raisedId],
  );
  const [internal, setInternal] = useState<string | null>(initial);
  const [entered, setEntered] = useState(!enterFromStack);

  useEffect(() => {
    if (raisedId !== undefined) setInternal(raisedId);
  }, [raisedId]);

  useEffect(() => {
    if (!enterFromStack) {
      setEntered(true);
      return;
    }
    setEntered(false);
    const t = window.setTimeout(() => setEntered(true), 60);
    return () => window.clearTimeout(t);
  }, [enterFromStack]);

  useEffect(() => {
    if (!cards.some((c) => c.id === internal)) {
      setInternal(cards[0]?.id ?? null);
    }
  }, [cards, internal]);

  const raised = internal;

  // Ordered: [raised, ...rest]. Index 0 = front (bottom-anchored).
  const ordered = useMemo(() => {
    if (!raised) return cards;
    const raisedCard = cards.find((c) => c.id === raised);
    const rest = cards.filter((c) => c.id !== raised);
    return raisedCard ? [raisedCard, ...rest] : cards;
  }, [cards, raised]);

  const count = ordered.length;
  const raisedCard = cards.find((c) => c.id === raised);

  // Measure container width -> card height (aspect 1.586:1).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState<number>(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setCardHeight(el.clientWidth / 1.586);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Spread gap in expanded state: enough of each card to be recognizable.
  const spreadGap = Math.max(peek + 40, cardHeight * 0.32);

  // Expansion progress: 0 collapsed .. 1 fully spread. Can rubber-band > 1.
  const [expand, setExpand] = useState(0);
  const expandRef = useRef(0);
  useEffect(() => {
    expandRef.current = expand;
  }, [expand]);

  // Animation frame handle for spring settle.
  const rafRef = useRef<number | null>(null);
  const cancelSpring = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // Spring settle toward target with velocity.
  const springTo = useCallback((target: number, v0 = 0) => {
    cancelSpring();
    if (prefersReducedMotion()) {
      setExpand(target);
      return;
    }
    let x = expandRef.current;
    let v = v0;
    const stiffness = 170;
    const damping = 22;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const f = -stiffness * (x - target) - damping * v;
      v += f * dt;
      x += v * dt;
      if (Math.abs(x - target) < 0.001 && Math.abs(v) < 0.01) {
        x = target;
        v = 0;
        setExpand(x);
        rafRef.current = null;
        return;
      }
      setExpand(x);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => cancelSpring(), []);

  // Pointer-drag on the stack container.
  const dragRef = useRef({
    active: false,
    pointerId: 0 as number,
    startY: 0,
    startExpand: 0,
    lastY: 0,
    lastT: 0,
    v: 0, // px/sec
    moved: false,
  });

  const expandRange = Math.max(120, cardHeight * 0.55); // px drag = full expand

  const onPointerDown = (e: React.PointerEvent) => {
    if (count <= 1) return;
    // Only left button / touch / pen
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cancelSpring();
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startY: e.clientY,
      startExpand: expandRef.current,
      lastY: e.clientY,
      lastT: performance.now(),
      v: 0,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    const dy = e.clientY - d.startY;
    // Negative dy (drag up) expands. Also drag down from expanded collapses.
    let next = d.startExpand + -dy / expandRange;
    // Rubber-band beyond bounds.
    if (next < 0) next = next * 0.35;
    else if (next > 1) next = 1 + (next - 1) * 0.35;
    // Velocity (px/sec of expand-normalized).
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = ((e.clientY - d.lastY) / dt) * 1000; // px/sec vertical
    d.lastY = e.clientY;
    d.lastT = now;
    if (Math.abs(dy) > 4) d.moved = true;
    setExpand(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    d.active = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (!d.moved) return; // treat as click, handled by card button
    // Convert vertical velocity (px/sec) to expand-space velocity (units/sec).
    // Upward flick (negative dy velocity) increases expand.
    const vExpand = -d.v / expandRange;
    // Predict where we'd land in ~180ms.
    const projected = expandRef.current + vExpand * 0.18;
    const target = projected > 0.5 ? 1 : 0;
    springTo(target, vExpand);
  };

  // Reset expansion when raised card changes externally.
  useEffect(() => {
    if (expandRef.current !== 0) springTo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raised]);

  // Collapse if the set of cards changes drastically.
  useEffect(() => {
    if (count <= 1 && expandRef.current !== 0) springTo(0);
  }, [count, springTo]);

  // Extra container height when expanded (grows upward space so peeks don't
  // overflow above the stack region). Uses padding-top so raised card stays
  // anchored at the bottom.
  const extraHeight = Math.max(0, count - 1) * Math.max(0, spreadGap - peek);
  const dynamicPadTop = Math.max(0, expand) * extraHeight;
  const collapsedH = cardHeight + Math.max(0, count - 1) * peek;

  const raisedY = collapsedH - cardHeight; // raised card top offset (bottom-anchor).

  return (
    <div className={pocket ? "tap-physical-wallet" : undefined}>
      <div
        ref={containerRef}
        className="cs-stack"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          paddingTop: cardHeight ? `${dynamicPadTop}px` : undefined,
          height: cardHeight ? `${collapsedH}px` : `calc(100vw / 1.586)`,
          touchAction: count > 1 ? "pan-x" : "auto",
        }}
      >
        {ordered.map((c, i) => {
          const inPile = enterFromStack && !entered;
          const k = inPile ? Math.max(i, 1) : i; // 0 = front raised

          // Gap grows with expand from peek -> spreadGap.
          const gap = peek + Math.max(0, Math.min(1.2, expand)) * (spreadGap - peek);

          // Position: raised (k=0) sits at raisedY. Cards behind stack upward.
          // In the recommendation moment the winning card physically rises
          // above the rest of the wallet. This is the central TAP gesture:
          // the answer should be visible before the explanation is read.
          const winnerLift = signal && k === 0 ? Math.min(78, cardHeight * 0.32) : 0;
          const y = raisedY - k * gap - winnerLift;

          // Scale interpolates toward 1 as we expand.
          const collapsedS = k === 0 ? 1 : Math.max(0.9, 1 - k * 0.025);
          const s = collapsedS + Math.max(0, Math.min(1, expand)) * (1 - collapsedS);

          // Opacity: peeks slightly muted collapsed; full at expand=1.
          const collapsedO = k === 0 ? 1 : Math.max(0.78, 1 - k * 0.06);
          const o = collapsedO + Math.max(0, Math.min(1, expand)) * (1 - collapsedO);

          // Depth-tracking shadow.
          const shadowElev = k === 0 ? 24 : Math.round(14 - Math.min(k, 5) * 1.5 + expand * 10);
          const shadowAlpha = k === 0 ? 0.28 : Math.max(0.12, 0.22 - k * 0.02) + expand * 0.06;
          const boxShadow = `0 ${shadowElev}px ${shadowElev * 1.8}px rgba(2, 6, 23, ${shadowAlpha.toFixed(3)})`;

          const z = count - i;
          const isRaised = i === 0;

          return (
            <button
              key={c.id}
              type="button"
              className="cs-stack-card"
              style={{
                transform: `translate3d(0, ${y}px, 0) scale(${s})`,
                zIndex: z,
                opacity: o,
                boxShadow,
                transition: dragRef.current.active
                  ? "none"
                  : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease, box-shadow 260ms ease",
              }}
              onClick={(e) => {
                if (dragRef.current.moved) {
                  e.preventDefault();
                  return;
                }
                if (isRaised && expandRef.current < 0.35) {
                  onOpen?.(c.id);
                  return;
                }
                setInternal(c.id);
                onRaise?.(c.id);
                if (expandRef.current > 0.05) springTo(0);
              }}
              aria-pressed={isRaised}
              aria-label={
                isRaised && expandRef.current < 0.35 ? `Open ${c.name}` : `Raise ${c.name}`
              }
            >
              <CardFace
                issuer={c.issuer}
                name={c.name}
                variant={isRaised && c.winner ? "winner" : "default"}
                trailing={isRaised ? c.trailing : undefined}
              />
            </button>
          );
        })}
      </div>

      {pocket && (
        <>
          <div
            className="tap-contactless-signal"
            data-visible={signal ? "true" : "false"}
            aria-hidden
          >
            <i />
            <i />
            <i />
          </div>
          <div className="tap-leather-pocket" aria-hidden>
            <span className="tap-leather-stitch" />
            {pocketLabel ? <span className="tap-pocket-label">{pocketLabel}</span> : null}
          </div>
        </>
      )}

      {raisedCard?.detail ? <div className="mt-5 cs-result-in">{raisedCard.detail}</div> : null}
    </div>
  );
}
