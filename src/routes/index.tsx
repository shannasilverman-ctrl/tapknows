import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  LockKeyhole,
  MapPin,
  ScanLine,
  ShieldCheck,
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

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [returning, setReturning] = useState(false);

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

      <section className="tap-hero">
        <div className="tap-hero-copy">
          <p className="tap-kicker">
            <Sparkles size={14} /> Your wallet, finally decisive
          </p>
          <h1>
            Ask once.
            <br />
            <em>Tap the right card.</em>
          </h1>
          <p className="tap-deck">
            Tell TAP what you’re buying. Get one clear answer, the real value, and the reason—before
            you pay.
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

        <div className="tap-phone-stage" aria-label="TAP recommendation preview">
          <div className="tap-halo" aria-hidden />
          <div className="tap-phone">
            <div className="tap-phone-bar">
              <span>9:41</span>
              <span className="tap-island" />
              <span>•••</span>
            </div>
            <div className="tap-phone-head">
              <span className="tap-mini-logo">
                TAP
                <i />
              </span>
              <span className="tap-avatar">SS</span>
            </div>
            <div className="tap-context">
              <span>
                <MapPin size={13} /> Whole Foods
              </span>
              <strong>$86.40</strong>
            </div>
            <div className="tap-answer-card">
              <p>Tap this</p>
              <div className="tap-card-visual tap-card-coral">
                <span>AMERICAN EXPRESS</span>
                <b>GOLD</b>
                <i>•••• 2401</i>
              </div>
              <h2>Amex Gold</h2>
              <div className="tap-win">
                <strong>4×</strong>
                <span>on groceries</span>
                <b>≈ $6.91 back</b>
              </div>
              <div className="tap-confidence">
                <span>
                  <ShieldCheck size={14} /> High confidence
                </span>
                <button type="button">
                  Why this card <ChevronDown size={14} />
                </button>
              </div>
            </div>
            <p className="tap-runner">
              Next best: <b>Blue Cash Preferred</b> · ≈ $5.18
            </p>
          </div>
          <div className="tap-proof-float">
            <span>
              Worth <b>$1.73 more</b>
            </span>
            <small>than your next-best card</small>
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
