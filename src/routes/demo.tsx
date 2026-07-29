import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/wordmark";
import { CardFace } from "@/components/card-face";
import { WalletStack, type StackCard } from "@/components/wallet-stack";
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
 * Six-step guided journey demo. The viewer advances explicitly, so the
 * experience never moves on while they are still reading. Motion is
 * transform/opacity only, under 450ms, with a reduced-motion fallback baked
 * into the shared cs-fade-up.
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

const BEAT_META: Record<Beat, { label: string; caption: string }> = {
  1: {
    label: "The purchase",
    caption: "Start with a merchant and amount. No bank connection required.",
  },
  2: {
    label: "Add your cards",
    caption: "If you choose Plaid, TAP can identify eligible cards without storing card numbers.",
  },
  3: { label: "Your wallet", caption: "Cards slide into your wallet." },
  4: { label: "At checkout", caption: "You walk into a store. A pass lands." },
  5: { label: "The answer", caption: "The winning card rises with a reason." },
  6: {
    label: "What you gained",
    caption: "The tap completes. TAP shows the estimated difference for this purchase.",
  },
};

// Per-tap earnings for the checkout demo (Q3 2026 accurate: Freedom Flex 5%
// this quarter is gas / transit / live entertainment / United Way — groceries
// are not a category, so the winner at a grocery store is Amex Gold at 4x.)
const TAP_SPEND_CENTS = 8400; // $84 grocery basket
const TAP_POINTS = 336; // Amex Gold 4x on $84
const TAP_EARN_CENTS = 672; // 336 Membership Rewards points at TAP's 2.0¢ default
const DEFAULT_POINTS = 84; // 1x runner-up
const DEFAULT_EARN_CENTS = 172; // 84 Ultimate Rewards points at TAP's 2.05¢ default

function DemoPage() {
  const navigate = useNavigate();
  const [beat, setBeat] = useState<Beat>(1);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    setInteractive(true);
  }, []);

  const advance = () => setBeat((b) => Math.min(6, (b + 1) as Beat) as Beat);
  const retreat = () => setBeat((b) => Math.max(1, (b - 1) as Beat) as Beat);
  const restart = () => {
    setBeat(1);
  };

  return (
    <div className="tap-demo-screen">
      <header className="tap-demo-nav">
        <button
          onClick={() => navigate({ to: "/" })}
          className="tap-demo-exit"
          aria-label="Exit demo"
        >
          <ArrowLeft className="size-4" />
          Exit
        </button>
        <Wordmark size="sm" />
        <Link to="/onboarding" className="tap-demo-nav-cta">
          Add my cards
        </Link>
      </header>

      <main className="tap-demo-experience">
        <aside className="tap-demo-narrative">
          <p className="tap-demo-eyebrow">30-second product tour</p>
          <h1>See how TAP makes the call.</h1>
          <p className="tap-demo-intro">
            Follow an $84 grocery run from wallet to recommendation—and see the math.
          </p>
          <div className="tap-demo-scenario" aria-label="Example purchase">
            <span>Whole Foods</span>
            <strong>$84.00</strong>
          </div>
          <ol className="tap-demo-chapters" aria-label="Demo chapters">
            {([1, 2, 3, 4, 5, 6] as Beat[]).map((b) => {
              const active = beat === b;
              const done = beat > b;
              return (
                <li key={b}>
                  <button
                    type="button"
                    onClick={() => setBeat(b)}
                    disabled={!interactive}
                    aria-label={`Step ${b}: ${BEAT_META[b].label}`}
                    aria-current={active ? "step" : undefined}
                    data-done={done ? "true" : "false"}
                  >
                    <span>{done ? <Check size={14} /> : b}</span>
                    <div>
                      <strong>{BEAT_META[b].label}</strong>
                      <small>{BEAT_META[b].caption}</small>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="tap-demo-privacy">Guided example · no bank connection · no card numbers</p>
        </aside>

        <section className="tap-demo-stage" aria-live="polite">
          <div className="tap-demo-stage-head">
            <div>
              <p>Step {beat} of 6</p>
              <h2>{BEAT_META[beat].label}</h2>
            </div>
            <span>{Math.round((beat / 6) * 100)}%</span>
          </div>
          <div className="tap-demo-progress" aria-hidden>
            <i style={{ width: `${(beat / 6) * 100}%` }} />
          </div>

          <div className="tap-demo-frame">
            {beat === 1 && <BeatGetStarted />}
            {beat === 2 && <BeatConnect />}
            {beat === 3 && <BeatWallet />}
            {beat === 4 && <BeatCheckout />}
            {beat === 5 && <BeatOptimize />}
            {beat === 6 && <BeatPaid onRestart={restart} />}
          </div>

          <p className="tap-demo-caption">{BEAT_META[beat].caption}</p>
          <div className="tap-demo-controls">
            <button
              type="button"
              onClick={retreat}
              disabled={!interactive || beat === 1}
              className="tap-demo-back"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            {beat < 6 ? (
              <button
                type="button"
                onClick={advance}
                disabled={!interactive}
                className="tap-demo-next"
              >
                Next
                <ArrowRight size={16} aria-hidden />
              </button>
            ) : (
              <Link to="/onboarding" className="tap-demo-next">
                Add my cards
                <ArrowRight size={16} aria-hidden />
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------------- Beat 1 · Get started ---------------- */

function BeatGetStarted() {
  return (
    <div className="cs-fade-up">
      <div className="tap-demo-opening-card">
        <div className="tap-demo-opening-top">
          <span>Whole Foods · groceries</span>
          <strong>$84.00</strong>
        </div>
        <div className="tap-demo-opening-copy">
          <p>TAP</p>
          <h2>One purchase. One clear card.</h2>
          <span>
            TAP checks the cards you already carry and tells you which one wins before checkout.
          </span>
        </div>
        <div className="tap-demo-opening-answer">
          <span>Best card for this purchase</span>
          <strong>Amex Gold · 4×</strong>
          <small>{TAP_POINTS} points · estimated $6.72 travel value</small>
        </div>
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
          <p className="text-[13px] font-medium text-foreground">Optional bank sync</p>
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
                    {/* No chevron on the unselected rows: these are a
                        simulation, not a list you can tap, and a chevron would
                        promise an interaction that does not exist. */}
                    {isSel && step === 1 ? (
                      <span className="cs-spinner" aria-label="Connecting" />
                    ) : null}
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
        Example only — no bank is connected during this demo.
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
  const [whyOpen, setWhyOpen] = useState(false);
  const cards: StackCard[] = [winner, ...others].map((card, index) => ({
    id: card.id,
    issuer: card.issuer,
    name: card.name,
    winner: index === 0,
  }));

  return (
    <div className="cs-fade-up">
      <div className="tap-demo-recommendation rounded-3xl bg-surface border border-border p-4">
        <p className="tap-merchant-pill">Whole Foods · groceries</p>
        <h2 className="tap-demo-pick">Use Amex Gold.</h2>
        <div className="tap-demo-wallet-stage">
          <WalletStack
            cards={cards}
            mode="recommendation"
            raisedCardId={winner.id}
            enterFromStack
            pocket
            pocketLabel="Your wallet · 4 cards"
          />
        </div>

        <div className="tap-demo-value-panel rounded-2xl bg-primary/6 border border-primary/12 px-4 py-3">
          <p className="cs-microlabel text-[10px] text-primary">Value of this choice</p>
          <p className="tap-demo-value">{TAP_POINTS} points · estimated $6.72 travel value</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            At TAP’s 2.0¢/point default · change anytime
          </p>
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-[12px] text-muted-foreground">Versus the next best card</p>
            <p className="cs-money text-[18px] font-semibold text-primary">
              +{dollars(TAP_EARN_CENTS - DEFAULT_EARN_CENTS)}
            </p>
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Amex Gold earns 4× at U.S. supermarkets. That is {TAP_POINTS} Membership Rewards points
            on this purchase.
          </p>
        </div>
        <button className="tap-demo-used" type="button" tabIndex={-1}>
          Used it
        </button>
        <button className="tap-demo-why" type="button" onClick={() => setWhyOpen(true)}>
          Why this card?
        </button>
        {whyOpen && (
          <div className="tap-demo-proof" role="dialog" aria-label="Why Amex Gold?">
            <button
              type="button"
              className="tap-demo-proof-close"
              onClick={() => setWhyOpen(false)}
              aria-label="Close explanation"
            >
              ×
            </button>
            <h3>Why Amex Gold?</h3>
            <div className="tap-demo-proof-card">
              <span className="tap-proof-swatch tap-proof-swatch-gold" />
              <span>
                <strong>Amex Gold</strong>
                <small>{TAP_POINTS} points · 4× groceries</small>
              </span>
              <strong>est. $6.72</strong>
            </div>
            <div className="tap-demo-proof-card">
              <span className="tap-proof-swatch tap-proof-swatch-blue" />
              <span>
                <strong>Sapphire</strong>
                <small>{DEFAULT_POINTS} points · 1×</small>
              </span>
              <strong>est. $1.72</strong>
            </div>
            <div className="tap-demo-proof-delta">
              <span>Estimated difference</span>
              <strong>+$5.00</strong>
            </div>
            <ul>
              <li>Rates checked Jul 12, 2026</li>
              <li>Amex assumption: 2.0¢ per point · TAP default</li>
              <li>Chase assumption: 2.05¢ per point · TAP default</li>
              <li>Bonus cap status: not provided</li>
            </ul>
            <p>
              TAP never recommends a card because it pays us. Interest can cost more than rewards.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Beat 6 · Paid ---------------- */

function BeatPaid({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="cs-fade-up">
      {/* Receipt */}
      <div className="rounded-2xl bg-white border border-dashed border-border-strong px-5 py-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
          Receipt · Whole Foods
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-foreground">Amex Gold earns</p>
          <p className="cs-money text-[22px] font-semibold text-foreground">{TAP_POINTS} points</p>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <p className="text-[12px] text-muted-foreground">Estimated travel value at 2.0¢/pt</p>
          <p className="cs-money text-[13px] text-muted-foreground">{dollars(TAP_EARN_CENTS)}</p>
        </div>
        <div className="mt-2 pt-2 border-t border-border flex items-baseline justify-between gap-3">
          <p className="text-[12px] font-medium text-foreground">More than the next best card</p>
          <p className="cs-money text-[15px] font-semibold text-primary">
            +{dollars(TAP_EARN_CENTS - DEFAULT_EARN_CENTS)}
          </p>
        </div>
      </div>

      <div className="mt-5 text-center">
        <p className="font-display text-4xl text-foreground">One clear answer. Visible math.</p>
        <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          This is an illustration, not a posted reward balance. Your issuer determines the points
          that ultimately post.
        </p>
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
