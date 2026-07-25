import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { BRAND_NAME, BRAND_CONTACT_EMAIL } from "@/lib/brand";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "TAP — Terms" },
      {
        name: "description",
        content:
          "Terms of use for TAP — an educational credit card rewards planner, not financial advice.",
      },
      { property: "og:title", content: "TAP — Terms" },
      {
        property: "og:description",
        content: "Terms of use for TAP — an educational rewards planner.",
      },
      { property: "og:url", content: "https://tapknows.com/terms" },
      { name: "twitter:url", content: "https://tapknows.com/terms" },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: "https://tapknows.com/terms" }],
  }),
});

function TermsPage() {
  return (
    <div className="cs-app-body tap-consumer-screen min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Use</h1>
        <p className="mt-2 text-xs text-muted-foreground">Effective: v1 beta.</p>

        <Section title="Educational use, not financial advice">
          {BRAND_NAME} is an educational tool for comparing credit card earn rates against
          hypothetical purchases. Nothing shown in the app is financial, tax, legal, or credit
          advice. Any decision to spend, apply for a card, or redeem points is yours.
        </Section>

        <Section title="No affiliation with issuers">
          {BRAND_NAME} is independent. Card names, program names, and offers referenced in the app
          are the property of their respective issuers and are used for identification and education
          only.
        </Section>

        <Section title="Illustrative data">
          The built-in card catalog is transcribed from public issuer terms and labeled with a
          "rates as of" date. Rates, benefits, and offers change without notice. Any example offers
          shown in demos are illustrative. Before you rely on a rate or offer, verify it with the
          issuer.
        </Section>

        <Section title="Your account">
          You are responsible for keeping your login credentials secure and for the accuracy of the
          cards, offers, and assumptions you enter. You may delete your account at any time from
          Settings.
        </Section>

        <Section title="Acceptable use">
          Do not use {BRAND_NAME} to attempt to disrupt the service, scrape data at scale, or
          reverse-engineer other users' data. We may suspend accounts that materially violate these
          terms.
        </Section>

        <Section title="Disclaimer of warranties">
          The service is provided "as is." To the maximum extent allowed by law, {BRAND_NAME}{" "}
          disclaims all warranties, express or implied, including fitness for a particular purpose.{" "}
          {BRAND_NAME} is not liable for financial decisions made on the basis of any output of the
          app.
        </Section>

        <Section title="Contact">
          Questions:{" "}
          <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="underline hover:text-foreground">
            {BRAND_CONTACT_EMAIL}
          </a>
          .
        </Section>
      </main>
      <FooterDisclaimer />
    </div>
  );
}

function TopBar() {
  return (
    <header className="px-6 pt-6 pb-4 max-w-6xl mx-auto flex items-center justify-between">
      <Link to="/">
        <Wordmark size="md" />
      </Link>
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Home
      </Link>
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function FooterDisclaimer() {
  return (
    <footer className="px-6 py-10 border-t border-border max-w-2xl mx-auto mt-10">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {BRAND_NAME} is an educational tool, not financial advice. Earn rates and offers shown are
        illustrative and may change. Verify with your issuer.
      </p>
    </footer>
  );
}
