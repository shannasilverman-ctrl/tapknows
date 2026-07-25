import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "@/components/wordmark";
import { CardFace } from "@/components/card-face";
import { dollars } from "@/lib/format";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  Landmark,
  ShoppingCart,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
});

/**
 * Six-beat guided journey demo. Each beat auto-advances after a short
 * dwell, with a Skip control. Motion is transform/opacity only, under
 * 450ms, with a reduced-motion fallback baked into the shared cs-fade-up.
 *
 * Beats:
 *   1. Get started
 *   2. Connect (simulated bank link, Plaid-style)
 *   3. Your wallet (cards slide into the stack one by one)
 *   4. At checkout (merchant + alert + decide open)
 *   5. Optimization (winner rises with reasoning + value)
 *   6. Paid (receipt + running balance + annualized counter)
 */

type Beat = 1 | 2 | 3 | 4 | 5 | 6;

type DemoCard = {
  id: string;
  issuer: string;
  name: string;
  last4: string;
};

const DEMO_CARDS: DemoCard[] = [
  { id: "amex-gold", issuer: "American Express", name: "Gold", last4: "4821" },
  { id: "chase-freedom-flex", issuer: "Chase", name: "Freedom Flex", last4: "7304" },
  { id: "citi-dc", issuer: "Citi", name: "Double Cash", last4: "2915" },
  { id: "capone-sr", issuer: "Capital One", name: "Savor Rewards", last4: "8102" },
];

const BEAT_MS: Record<Beat, number> = {
  1: 2400,
  2: 5200,
  3: 4200,
  4: 3800,
  5: 3600,
  6: 6000,
};

const BEAT_META: Record<Beat, { label: string; caption: string }> = {
  1: { label: "Get started", caption: "You tap Try TAP now. Guest mode begins." },
  2: {
    label: "Connect",
    caption: "Choose your bank. TAP reads your card list — never numbers.",
  },
  3: { label: "Your wallet", caption: "Cards slide into your wallet." },
  4: { label: "At checkout", caption: "You walk into a store. A pass lands." },
  5: { label: "Optimization", caption: "The winning card rises with a reason." },
  6: { label: "Paid", caption: "The tap completes. Your balance ticks up." },
};

// Per-tap earnings for the checkout demo (Q3 2026 accurate: Freedom Flex 5%
// this quarter is gas / transit / live entertainment / United Way — groceries
// are not a category, so the winner at a grocery store is Amex Gold at 4x.)
const TAP_SPEND_CENTS = 6000; // $60 grocery basket
const TAP_EARN_CENTS = 240; // Amex Gold 4x on $60 = $2.40
const DEFAULT_EARN_CENTS = 60; // 1% default card

function DemoPage() {
  const navigate = useNavigate();
  const [beat, setBeat] = useState<Beat>(1);
  const [recoveredCents, setRecoveredCents] = useState(1284); // month-to-date starting point

  useEffect(() => {
    if (beat === 6) return; // last beat holds
    const t = window.setTimeout(
      () => setBeat((b) => Math.min(6, (b + 1) as Beat) as Beat),
      BEAT_MS[beat],
    );
    return () => window.clearTimeout(t);
  }, [beat]);

  const advance = () => setBeat((b) => Math.min(6, (b + 1) as Beat) as Beat);
  const restart = () => {
    setRecoveredCents(1284);
    setBeat(1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="px-5 pt-6 pb-3 flex items-center justify-between max-w-md w-full mx-auto">
        <button
          onClick={() => navigate({ to: "/home" })}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground min-h-11"
          aria-label="Exit demo"
        >
          <ArrowLeft className="size-4" />
          Exit
        </button>
        <Wordmark size="sm" />
        {beat < 6 ? (
          <button
            onClick={advance}
            className="text-sm text-muted-foreground hover:text-foreground min-h-11 px-2"
          >
            Skip
          </button>
        ) : (
          <div className="w-11" />
        )}
      </header>

      {/* Progress dots */}
      <div className="px-5 max-w-md w-full mx-auto">
        <div className="flex items-center gap-1.5">
          {([1, 2, 3, 4, 5, 6] as Beat[]).map((b) => {
            const active = beat === b;
            const done = beat > b;
            return (
              <div
                key={b}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  active ? "bg-foreground" : done ? "bg-foreground/40" : "bg-secondary"
                }`}
              />
            );
          })}
        </div>
        <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Beat {beat} of 6 · {BEAT_META[beat].label}
        </p>
      </div>

      <main className="flex-1 px-5 pb-10 max-w-md w-full mx-auto pt-6">
        {beat === 1 && <BeatGetStarted />}
        {beat === 2 && <BeatConnect />}
        {beat === 3 && <BeatWallet />}
        {beat === 4 && <BeatCheckout />}
        {beat === 5 && <BeatOptimize />}
        {beat === 6 && (
          <BeatPaid
            recoveredCents={recoveredCents + TAP_EARN_CENTS - DEFAULT_EARN_CENTS}
            onRestart={restart}
          />
        )}

        <p className="mt-6 text-[12px] text-foreground leading-snug">{BEAT_META[beat].caption}</p>
      </main>
    </div>
  );
}

/* ---------------- Beat 1 · Get started ---------------- */

function BeatGetStarted() {
  return (
    <div className="cs-fade-up">
      <div className="relative rounded-3xl border border-border bg-surface overflow-hidden">
        {/* Faux landing page */}
        <div className="p-6">
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-medium">TAP</p>
          <h2 className="mt-2 font-display text-2xl tracking-tight text-foreground">
            Every tap, optimized.
          </h2>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            One clear pick, every time. No card numbers stored.
          </p>
          <div className="mt-5">
            <button
              className="cs-cta-tap w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-medium inline-flex items-center justify-center gap-2"
              aria-hidden
              tabIndex={-1}
            >
              Try TAP now
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
        {/* Tap indicator ring */}
        <div
          className="pointer-events-none absolute left-1/2 bottom-[70px] -translate-x-1/2 cs-tap-ring"
          aria-hidden
        />
      </div>
    </div>
  );
}

/* ---------------- Beat 2 · Connect (Plaid-style) ---------------- */

const BANKS = [
  { id: "chase", name: "Chase" },
  { id: "amex", name: "American Express" },
  { id: "capone", name: "Capital One" },
  { id: "citi", name: "Citi" },
  { id: "boa", name: "Bank of America" },
];

function BeatConnect() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setSelected("chase");
      setStep(1);
    }, 1400);
    const t2 = window.setTimeout(() => setStep(2), 3200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <div className="cs-fade-up">
      <div className="rounded-3xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border flex items-center gap-2">
          <Landmark className="size-4 text-muted-foreground" />
          <p className="text-[13px] font-medium text-foreground">Link your bank</p>
        </div>

        {step < 2 ? (
          <ul className="p-2">
            {BANKS.map((b) => {
              const isSel = selected === b.id;
              return (
                <li key={b.id}>
                  <div
                    className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl transition-colors duration-200 ${
                      isSel ? "bg-primary/8" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-secondary text-foreground text-[11px] font-semibold">
                        {b.name.slice(0, 1)}
                      </span>
                      <p className="text-[14px] text-foreground">{b.name}</p>
                    </div>
                    {isSel && step === 1 ? (
                      <span className="cs-spinner" aria-label="Connecting" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-6 flex flex-col items-center text-center cs-beat-in">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
              <Check className="size-6" />
            </span>
            <p className="mt-3 text-[15px] font-medium text-foreground">Connected</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Found {DEMO_CARDS.length} cards. Nothing sensitive stored.
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground text-center">
        Simulation — live bank linking via Plaid coming soon.
      </p>
    </div>
  );
}

/* ---------------- Beat 3 · Your wallet ---------------- */

function BeatWallet() {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const timers = DEMO_CARDS.map((_, i) =>
      window.setTimeout(() => setVisible(i + 1), 220 + i * 380),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const peek = 48;
  const count = DEMO_CARDS.length;

  return (
    <div className="cs-fade-up">
      <div className="rounded-3xl bg-surface border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="size-4 text-muted-foreground" />
          <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Wallet
          </p>
        </div>

        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "1.586 / 1", marginBottom: `${(count - 1) * peek}px` }}
        >
          {DEMO_CARDS.map((c, i) => {
            const shown = i < visible;
            const y = i === 0 ? "0px" : `calc(100% + ${(i - 1) * peek}px - ${100 - peek}%)`;
            return (
              <div
                key={c.id}
                className="cs-wallet-drop"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  transform: shown
                    ? `translateY(${i * peek}px) scale(${1 - i * 0.012})`
                    : `translateY(-140%) scale(0.94)`,
                  opacity: shown ? 1 : 0,
                  zIndex: count - i,
                  transition:
                    "transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out",
                  aspectRatio: "1.586 / 1",
                }}
                aria-hidden={!shown}
              >
                <CardFace issuer={c.issuer} name={c.name} last4={c.last4} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Beat 4 · At checkout ---------------- */

function BeatCheckout() {
  const [pass, setPass] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setPass(true), 800);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="cs-fade-up">
      <div className="relative rounded-3xl overflow-hidden border border-border bg-gradient-to-b from-primary/6 to-background min-h-[320px]">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2">
          <ShoppingCart className="size-4 text-primary" />
          <p className="text-[13px] font-medium text-foreground">Whole Foods · Union Square</p>
        </div>
        <p className="px-5 text-[12px] text-muted-foreground">
          You're at the register. Basket: ~{dollars(TAP_SPEND_CENTS)}.
        </p>

        <div className="p-5 pt-6">
          {pass ? (
            <div className="cs-pass cs-beat-in" role="status" aria-live="polite">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-md bg-foreground text-background">
                  <Bell className="size-3.5" />
                </span>
                <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-muted-foreground">
                  TAP · now
                </p>
              </div>
              <p className="mt-2 text-[14px] font-medium text-foreground">You're at Whole Foods.</p>
              <p className="mt-1 text-[13px] text-foreground/85">
                Use your Amex Gold — 4× on groceries.
              </p>
            </div>
          ) : (
            <div className="h-[86px] rounded-2xl bg-secondary/40" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Beat 5 · Optimization ---------------- */

function BeatOptimize() {
  const winner = DEMO_CARDS[0]; // Amex Gold
  const others = DEMO_CARDS.slice(1);
  const [risen, setRisen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setRisen(true), 260);
    return () => window.clearTimeout(t);
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setCardHeight(el.clientWidth / 1.586);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const peek = 40;
  const totalHeight = cardHeight + others.length * peek;

  return (
    <div className="cs-fade-up">
      <div className="rounded-3xl bg-surface border border-border p-4">
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden"
          style={{
            height: cardHeight
              ? `${totalHeight}px`
              : `calc(100vw / 1.586 + ${others.length * peek}px)`,
          }}
        >
          {/* Winner card at top */}
          <div
            className="absolute inset-x-0 top-0"
            style={{
              height: cardHeight ? `${cardHeight}px` : undefined,
              aspectRatio: cardHeight ? undefined : "1.586 / 1",
              transform: risen
                ? "translateY(-10px) scale(1.02)"
                : `translateY(${others.length * peek + 10}px) scale(0.97)`,
              zIndex: 10,
              transition: "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <CardFace
              issuer={winner.issuer}
              name={winner.name}
              last4={winner.last4}
              variant="winner"
            />
          </div>
          {/* Others peek from below the winner */}
          {others.map((c, i) => (
            <div
              key={c.id}
              className="absolute inset-x-0"
              style={{
                top: 0,
                height: cardHeight ? `${cardHeight}px` : undefined,
                aspectRatio: cardHeight ? undefined : "1.586 / 1",
                transform: `translateY(${cardHeight + i * peek}px) scale(${1 - (i + 1) * 0.014})`,
                opacity: risen ? 0.94 - i * 0.06 : 0.6,
                zIndex: 5 - i,
                transition:
                  "transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease-out",
              }}
              aria-hidden
            >
              <CardFace issuer={c.issuer} name={c.name} last4={c.last4} />
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-primary/6 border border-primary/12 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-primary/80 font-medium">
            Reason
          </p>
          <p className="mt-1 text-[13px] text-foreground">
            Amex Gold earns 4× on U.S. supermarkets. Beats your Freedom Flex here.
          </p>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-[12px] text-muted-foreground">Value of this choice</p>
            <p className="cs-money text-[18px] font-semibold text-primary">
              +{dollars(TAP_EARN_CENTS - DEFAULT_EARN_CENTS)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Beat 6 · Paid ---------------- */

function BeatPaid({
  recoveredCents,
  onRestart,
}: {
  recoveredCents: number;
  onRestart: () => void;
}) {
  const annualized = useMemo(() => recoveredCents * 12, [recoveredCents]);
  const [displayed, setDisplayed] = useState(0);
  const [balance, setBalance] = useState(recoveredCents - (TAP_EARN_CENTS - DEFAULT_EARN_CENTS));

  useEffect(() => {
    // tick the running balance up by the delta
    const t = window.setTimeout(() => setBalance(recoveredCents), 350);
    return () => window.clearTimeout(t);
  }, [recoveredCents]);

  useEffect(() => {
    const start = Date.now();
    const dur = 1200;
    const from = 0;
    const to = annualized;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [annualized]);

  return (
    <div className="cs-fade-up">
      {/* Receipt */}
      <div className="rounded-2xl bg-white border border-dashed border-border-strong px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
          Receipt · Whole Foods
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-foreground">This tap earned</p>
          <p className="cs-money text-[22px] font-semibold text-foreground">
            {dollars(TAP_EARN_CENTS)}
          </p>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <p className="text-[12px] text-muted-foreground">Default card would earn</p>
          <p className="cs-money text-[13px] text-muted-foreground">
            {dollars(DEFAULT_EARN_CENTS)}
          </p>
        </div>
        <div className="mt-2 pt-2 border-t border-border flex items-baseline justify-between gap-3">
          <p className="text-[12px] font-medium text-foreground">You gained</p>
          <p className="cs-money text-[15px] font-semibold text-primary">
            +{dollars(TAP_EARN_CENTS - DEFAULT_EARN_CENTS)}
          </p>
        </div>
      </div>

      {/* Running balance */}
      <div className="mt-4 rounded-2xl bg-primary/6 border border-primary/12 px-4 py-3 flex items-center justify-between">
        <p className="text-[12px] text-foreground">Recovered this month</p>
        <p className="cs-money cs-count text-[16px] font-semibold text-primary" aria-live="polite">
          {dollars(balance)}
        </p>
      </div>

      {/* Annualized counter */}
      <div className="mt-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
          At this pace, that's
        </p>
        <p
          className="cs-money mt-3 font-display text-5xl sm:text-6xl text-foreground"
          aria-live="polite"
        >
          {dollars(displayed)}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">a year</p>
      </div>

      <div className="mt-8 flex flex-col gap-2">
        <Link
          to="/onboarding"
          className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Set up my wallet
          <ChevronRight className="size-4" />
        </Link>
        <button
          onClick={onRestart}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors py-2 min-h-11"
        >
          Watch again
        </button>
      </div>
    </div>
  );
}
