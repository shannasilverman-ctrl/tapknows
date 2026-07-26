import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { CardFace } from "@/components/card-face";
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
  {
    label: "Groceries",
    rate: "4×",
    card: "Amex Gold",
    issuer: "American Express",
    last4: "6474",
    tone: "coral",
  },
  {
    label: "Travel",
    rate: "3×",
    card: "Sapphire",
    issuer: "Chase",
    last4: "1882",
    tone: "navy",
  },
  {
    label: "Everything else",
    rate: "2×",
    card: "Double Cash",
    issuer: "Citi",
    last4: "2915",
    tone: "sage",
  },
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
          <a href="#how">How TAP decides</a>
          <a href="#trust">Why trust TAP</a>
        </div>
        <Link to="/login" className="tap-nav-signin">
          Sign in
        </Link>
      </nav>

      <section className="tap-showcase-hero">
        <div className="tap-showcase-copy">
          <h1>
            Know before
            <br /> you tap.
          </h1>
          <p className="tap-deck">
            Tell TAP where you’re paying. It compares the cards you already carry and shows which
            one earns the most, with the math attached.
          </p>
          <div className="tap-hero-actions">
            <Link to={startTo} className="tap-primary">
              {returning ? "Open my wallet" : "Add my cards"} <ArrowRight size={18} />
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
        <p className="tap-promise-intro">One recommendation, calculated from</p>
        <div
          className="tap-promise-equation"
          aria-label="Your cards plus this purchase plus current terms equals the card to use"
        >
          <span>Your cards</span>
          <i>+</i>
          <span>This purchase</span>
          <i>+</i>
          <span>Current terms</span>
          <b>
            <ArrowRight aria-hidden />
            The card to use
          </b>
        </div>
      </section>

      <section id="how" className="tap-how">
        <div className="tap-section-heading">
          <h2>
            Three details in.
            <br />
            One card out.
          </h2>
          <p>
            TAP keeps setup small because the decision happens in real life, usually while someone
            is waiting behind you.
          </p>
        </div>
        <ol className="tap-steps">
          <li>
            <h3>Add the cards you already have</h3>
            <p>Search, scan a wallet screenshot, or add them manually. No full card numbers.</p>
            <span>Amex Gold · Sapphire · Double Cash</span>
          </li>
          <li>
            <h3>Tell TAP where you’re paying</h3>
            <p>A merchant or category is enough. Add the amount when it can change the pick.</p>
            <span>Whole Foods · Groceries · $84</span>
          </li>
          <li className="tap-step-answer">
            <h3>Use the winner</h3>
            <p>One recommendation up front, with the runner-up and assumptions one tap away.</p>
            <span>Amex Gold · about $3.36 back</span>
          </li>
        </ol>
      </section>

      <section className="tap-wallet-story">
        <div>
          <h2>A job for every card.</h2>
          <p>
            TAP turns your existing wallet into a usable playbook. See where each card wins, what
            that reward is worth, and when the answer changes.
          </p>
          <Link to={startTo} className="tap-text-link tap-text-link-dark">
            See what your wallet can do <ArrowRight size={17} />
          </Link>
        </div>
        <div className="tap-wallet-board">
          {proof.map((item) => (
            <div className={`tap-wallet-row tap-${item.tone}`} key={item.label}>
              <div className="tap-mini-card" aria-hidden>
                <CardFace
                  issuer={item.issuer}
                  name={item.card}
                  last4={item.last4}
                  className="tap-mini-card-face"
                />
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
        <div className="tap-trust-heading">
          <LockKeyhole aria-hidden />
          <h2>Clear math. No hidden agenda.</h2>
          <p>TAP is useful only if you can see why it chose a card and what it did not use.</p>
        </div>
        <dl className="tap-trust-grid">
          <div>
            <dt>No affiliate ranking</dt>
            <dd>TAP recommends the card that pays you, not us.</dd>
          </div>
          <div>
            <dt>No card numbers</dt>
            <dd>Only the product names in your wallet are needed.</dd>
          </div>
          <div>
            <dt>Visible assumptions</dt>
            <dd>Rates, credits, caps, and point values stay in view.</dd>
          </div>
          <div>
            <dt>Bank linking is optional</dt>
            <dd>If you connect an account, access is read-only and reversible.</dd>
          </div>
        </dl>
      </section>

      <section className="tap-close">
        <h2>Bring the right card to checkout.</h2>
        <p>Add the cards you already carry. TAP handles the comparison.</p>
        <Link to={startTo} className="tap-primary tap-primary-light">
          {returning ? "Open TAP" : "Add my cards"} <ArrowRight size={18} />
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
