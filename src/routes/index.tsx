import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  MapPin,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getGuestWallet } from "@/lib/guestWallet";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { property: "og:url", content: "https://tapknows.com/" },
      { name: "twitter:url", content: "https://tapknows.com/" },
    ],
    links: [{ rel: "canonical", href: "https://tapknows.com/" }],
  }),
});

const proof = [
  { label: "Groceries", rate: "4×", card: "Amex Gold", tone: "coral" },
  { label: "Travel", rate: "3×", card: "Sapphire", tone: "navy" },
  { label: "Everything else", rate: "2×", card: "Double Cash", tone: "sage" },
] as const;

const walkthroughScreens = ["Choose the place", "See your best card", "Check the math"] as const;

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [returning, setReturning] = useState(false);
  const [activeScreen, setActiveScreen] = useState(0);
  const swipeStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/home" });
  }, [loading, navigate, user]);

  useEffect(() => {
    try {
      setReturning(getGuestWallet().cards.length > 0);
    } catch {
      setReturning(false);
    }
  }, []);

  const startTo = returning ? "/home" : "/onboarding";
  const showScreen = (screen: number) => {
    setActiveScreen(Math.max(0, Math.min(walkthroughScreens.length - 1, screen)));
  };

  return (
    <main className="tap-landing">
      <nav className="tap-nav" aria-label="Primary">
        <Link to="/" className="tap-logo" aria-label="TAP home">
          <span>TAP</span>
          <i aria-hidden />
        </Link>
        <div className="tap-nav-links">
          <a href="#how">How it works</a>
          <a href="#trust">Trust</a>
        </div>
        <Link to="/login" className="tap-nav-signin">
          Sign in
        </Link>
      </nav>

      <section className="tap-showcase-hero">
        <div className="tap-showcase-copy">
          <p className="tap-kicker">
            <Sparkles size={14} /> Your wallet, finally decisive
          </p>
          <h1>
            Know before
            <br /> you tap.
          </h1>
          <p className="tap-deck">
            One clear card recommendation, the real value, and the reason—before you pay.
          </p>
          <div className="tap-hero-actions">
            <Link to={startTo} className="tap-primary">
              {returning ? "Open my wallet" : "Build my wallet"} <ArrowRight size={18} />
            </Link>
            <Link to="/demo" className="tap-text-link">
              See a 30-second demo
            </Link>
          </div>
          <p className="tap-no-login">
            <Check size={14} /> Start without connecting a bank
          </p>
        </div>

        <div className="tap-product-walkthrough">
          <div
            className="tap-device-stage"
            role="region"
            aria-roledescription="carousel"
            aria-label="Swipe through the TAP product experience"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") showScreen(activeScreen - 1);
              if (event.key === "ArrowRight") showScreen(activeScreen + 1);
            }}
            onPointerDown={(event) => {
              swipeStartX.current = event.clientX;
            }}
            onPointerUp={(event) => {
              if (swipeStartX.current == null) return;
              const distance = event.clientX - swipeStartX.current;
              swipeStartX.current = null;
              if (Math.abs(distance) < 42) return;
              showScreen(activeScreen + (distance < 0 ? 1 : -1));
            }}
            onPointerCancel={() => {
              swipeStartX.current = null;
            }}
          >
            <div
              className="tap-device-track"
              style={{ "--tap-active-screen": activeScreen } as CSSProperties}
            >
              <div
                className="tap-device-slide"
                data-active={activeScreen === 0 ? "true" : "false"}
                role="group"
                aria-roledescription="slide"
                aria-label="1 of 3: Choose the place"
              >
                <div className="tap-device tap-device-home">
                  <div className="tap-device-screen">
                    <div className="tap-device-status">
                      <b>9:41</b>
                      <span>▮▮▮ ◒ ▰</span>
                    </div>
                    <div className="tap-device-brand">
                      <b>TAP</b>
                      <i />
                    </div>
                    <h2>
                      Where are
                      <br />
                      you paying?
                    </h2>
                    <button
                      type="button"
                      className="tap-device-search"
                      onClick={() => showScreen(1)}
                      aria-label="Choose a store and see the recommended card"
                    >
                      ⌕&nbsp;&nbsp; Store or category
                    </button>
                    <p className="tap-device-label">Recent</p>
                    <button
                      type="button"
                      className="tap-device-recents"
                      onClick={() => showScreen(1)}
                      aria-label="Choose Whole Foods and see the recommended card"
                    >
                      <span>♧</span>
                      <b>Whole Foods</b>
                      <i>›</i>
                      <span>◎</span>
                      <b>Target</b>
                      <i>›</i>
                      <span>▱</span>
                      <b>Starbucks</b>
                      <i>›</i>
                    </button>
                    <div className="tap-leather-wallet tap-leather-wallet-home">
                      <span className="tap-wallet-card tap-wallet-card-silver" />
                      <span className="tap-wallet-card tap-wallet-card-rose" />
                      <span className="tap-wallet-card tap-wallet-card-gold" />
                      <span className="tap-wallet-mouth" />
                    </div>
                    <button
                      type="button"
                      className="tap-device-dock"
                      onClick={() => showScreen(1)}
                      aria-label="Open the four-card wallet"
                    >
                      <b>Your wallet · 4 cards</b>
                      <span>⌖&nbsp;&nbsp; Use location once</span>
                    </button>
                  </div>
                </div>
              </div>

              <div
                className="tap-device-slide"
                data-active={activeScreen === 1 ? "true" : "false"}
                role="group"
                aria-roledescription="slide"
                aria-label="2 of 3: See your best card"
              >
                <div className="tap-device tap-device-winner">
                  <div className="tap-device-screen">
                    <div className="tap-device-status">
                      <b>9:41</b>
                      <span>▮▮▮ ◒ ▰</span>
                    </div>
                    <div className="tap-device-pill">Whole Foods&nbsp; · &nbsp;Groceries</div>
                    <h2>Use Amex Gold.</h2>
                    <div className="tap-choice-wallet">
                      <span className="tap-choice-card tap-choice-card-back" />
                      <span className="tap-choice-card tap-choice-card-middle" />
                      <span className="tap-choice-card tap-choice-card-gold">
                        <i className="tap-card-line" />
                      </span>
                      <div className="tap-signal-rings">
                        <i />
                        <i />
                        <i />
                      </div>
                      <span className="tap-wallet-mouth" />
                    </div>
                    <div className="tap-choice-value">
                      <h3>About $3.36 in reward value</h3>
                      <p>Next best: about $0.84</p>
                      <div>
                        <span>Estimated difference:</span>
                        <b>+$2.52</b>
                      </div>
                      <small>Amount won’t change this pick.</small>
                    </div>
                    <div className="tap-choice-actions">
                      <Link to="/demo">Used it</Link>
                      <button type="button" onClick={() => showScreen(2)}>
                        Why this card?
                      </button>
                      <Link to="/demo">Wrong merchant or card?</Link>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="tap-device-slide"
                data-active={activeScreen === 2 ? "true" : "false"}
                role="group"
                aria-roledescription="slide"
                aria-label="3 of 3: Check the math"
              >
                <div className="tap-device tap-device-proof">
                  <div className="tap-device-screen">
                    <div className="tap-device-status tap-device-status-dark">
                      <b>9:41</b>
                      <span>▮▮▮ ◒ ▰</span>
                    </div>
                    <h2>Why Amex Gold?</h2>
                    <div className="tap-proof-choice">
                      <span className="tap-proof-mini-card tap-proof-mini-gold" />
                      <p>
                        <b>Amex Gold</b>
                        <small>4× groceries</small>
                      </p>
                      <strong>~$3.36</strong>
                    </div>
                    <div className="tap-proof-choice">
                      <span className="tap-proof-mini-card tap-proof-mini-blue" />
                      <p>
                        <b>Sapphire</b>
                        <small>1×</small>
                      </p>
                      <strong className="tap-proof-muted">~$0.84</strong>
                    </div>
                    <div className="tap-proof-gap">
                      <span>Estimated difference</span>
                      <b>+$2.52</b>
                    </div>
                    <div className="tap-proof-facts">
                      <p>▣&nbsp;&nbsp; Terms checked Jul 18, 2026</p>
                      <p>⚖&nbsp;&nbsp; Assumption: 1 point = 1¢</p>
                      <p>ⓘ&nbsp;&nbsp; Bonus cap status: not provided</p>
                      <div>
                        <button>Edit assumptions</button>
                        <button>Report an issue</button>
                      </div>
                    </div>
                    <p className="tap-proof-trust">
                      TAP never recommends a card
                      <br />
                      because it pays us.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="tap-walkthrough-controls" aria-label="Product screens">
            <button
              type="button"
              onClick={() => showScreen(activeScreen - 1)}
              disabled={activeScreen === 0}
              aria-label="Previous product screen"
            >
              <ChevronLeft />
            </button>
            <div className="tap-walkthrough-progress" aria-live="polite">
              <div>
                {walkthroughScreens.map((label, index) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => showScreen(index)}
                    aria-label={`Show ${label}`}
                    aria-current={activeScreen === index ? "step" : undefined}
                  >
                    <i />
                  </button>
                ))}
              </div>
              <span>{walkthroughScreens[activeScreen]}</span>
              <small>Swipe to explore</small>
            </div>
            <button
              type="button"
              onClick={() => showScreen(activeScreen + 1)}
              disabled={activeScreen === walkthroughScreens.length - 1}
              aria-label="Next product screen"
            >
              <ChevronRight />
            </button>
          </div>
        </div>
      </section>

      <section className="tap-promise">
        <p>TAP doesn’t give you another dashboard to manage.</p>
        <h2>It ends the decision.</h2>
      </section>

      <section id="how" className="tap-how">
        <div className="tap-section-heading">
          <p>One tiny habit</p>
          <h2>From “which card?” to done.</h2>
        </div>
        <div className="tap-steps">
          <article>
            <span className="tap-step-number">01</span>
            <div className="tap-step-icon">
              <ScanLine />
            </div>
            <h3>Add the cards you already have</h3>
            <p>Search, scan a wallet screenshot, or add them manually. No full card numbers.</p>
          </article>
          <article>
            <span className="tap-step-number">02</span>
            <div className="tap-step-icon">
              <MapPin />
            </div>
            <h3>Say what you’re buying</h3>
            <p>
              Merchant and amount are enough. TAP handles rewards, credits, caps, and your goals.
            </p>
          </article>
          <article className="tap-step-answer">
            <span className="tap-step-number">03</span>
            <div className="tap-step-icon">
              <Sparkles />
            </div>
            <h3>Tap the answer</h3>
            <p>One recommendation up front, with the runner-up and assumptions one tap away.</p>
          </article>
        </div>
      </section>

      <section className="tap-wallet-story">
        <div>
          <p className="tap-kicker">A wallet with a point of view</p>
          <h2>Every card gets a job.</h2>
          <p>
            TAP turns a stack of plastic into a simple playbook. You’ll know what each card is for,
            what it’s worth, and when another one wins.
          </p>
          <Link to={startTo} className="tap-text-link tap-text-link-dark">
            See what your wallet can do <ArrowRight size={17} />
          </Link>
        </div>
        <div className="tap-wallet-board">
          {proof.map((item, index) => (
            <div className={`tap-wallet-row tap-${item.tone}`} key={item.label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div className="tap-mini-card">
                <i />
              </div>
              <p>
                <small>{item.label}</small>
                <b>{item.card}</b>
              </p>
              <strong>{item.rate}</strong>
            </div>
          ))}
        </div>
      </section>

      <section id="trust" className="tap-trust">
        <div className="tap-trust-mark">
          <LockKeyhole />
        </div>
        <div>
          <p className="tap-kicker">Trust is a product feature</p>
          <h2>Your recommendation has no hidden agenda.</h2>
        </div>
        <div className="tap-trust-grid">
          <p>
            <b>No affiliate ranking.</b>
            <span>TAP recommends the card that pays you—not us.</span>
          </p>
          <p>
            <b>No card numbers.</b>
            <span>We only need the product names in your wallet.</span>
          </p>
          <p>
            <b>No mystery math.</b>
            <span>Rates, credits, caps, and assumptions stay visible.</span>
          </p>
          <p>
            <b>No bank connection required.</b>
            <span>Linking is optional, read-only, and reversible.</span>
          </p>
        </div>
      </section>

      <section className="tap-close">
        <p>At the register, certainty is worth more than another spreadsheet.</p>
        <h2>Know before you tap.</h2>
        <Link to={startTo} className="tap-primary tap-primary-light">
          {returning ? "Open TAP" : "Build my wallet"} <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="tap-footer">
        <Link to="/" className="tap-logo">
          <span>TAP</span>
          <i />
        </Link>
        <p>Make every card in your wallet earn its place.</p>
        <div>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <a href="mailto:hello@tapknows.com">Contact</a>
        </div>
        <small>
          © {new Date().getFullYear()} TAP. Card rewards and terms can change; verify with your
          issuer.
        </small>
      </footer>
    </main>
  );
}
