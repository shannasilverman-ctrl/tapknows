import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { BRAND_NAME, BRAND_CONTACT_EMAIL } from "@/lib/brand";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "TAP — Privacy" },
      {
        name: "description",
        // These claimed "no bank linking, no transaction sync" while the body
        // of this same page documents Plaid linking, the access token TAP
        // stores, and its retention. On a privacy page that is the worst place
        // to be inconsistent, and the meta description is exactly what search
        // results and link previews quote.
        content:
          "How TAP handles your data. Bank linking is optional via Plaid — TAP reads your merchants, never your login, and you can disconnect and delete anytime.",
      },
      { property: "og:title", content: "TAP — Privacy" },
      {
        property: "og:description",
        content:
          "How TAP handles your data. Bank linking is optional via Plaid — your merchants, never your login.",
      },
      { property: "og:url", content: "https://tapknows.com/privacy" },
      { name: "twitter:url", content: "https://tapknows.com/privacy" },
      { name: "robots", content: "index,follow" },
    ],
    links: [{ rel: "canonical", href: "https://tapknows.com/privacy" }],
  }),
});

function PrivacyPage() {
  return (
    <div className="cs-app-body tap-consumer-screen min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-xs text-muted-foreground">Effective: v1 beta.</p>

        <Section title="Summary">
          {BRAND_NAME} helps you optimize the cards you already carry. If you choose to link a bank,
          we use Plaid to learn your merchants — never your login. You can disconnect and delete
          anytime.
        </Section>

        <Section title="What we store">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Your email address if you create an account.</li>
            <li>
              The cards, offers, point-value assumptions, and manually logged purchases you enter.
            </li>
            <li>
              If you link a bank via Plaid: the institution name, an access token, and derived
              merchant-frequency aggregates.
            </li>
            <li>Basic technical logs (IP, user agent) used for security and debugging.</li>
          </ul>
        </Section>

        <Section title="Plaid data & retention">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              We access transactions through Plaid to learn which merchants you use most and to
              detect the credit cards you already own.
            </li>
            <li>We never see or store your bank login credentials.</li>
            <li>We never store account or routing numbers.</li>
            <li>
              Raw Plaid transaction rows are retained for a maximum of 30 days and are used only to
              derive merchant frequency. Derived aggregates carry no transaction details.
            </li>
            <li>
              Disconnecting a bank calls Plaid's <code>/item/remove</code> and deletes the access
              token and derived per-item data on our side. Deleting your account does the same for
              every linked bank.
            </li>
          </ul>
        </Section>

        <Section title="What we do not do">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>No storage of bank credentials.</li>
            <li>No storage of account or routing numbers.</li>
            <li>No sale of personal data to third parties.</li>
            <li>No advertising trackers embedded in the app.</li>
          </ul>
        </Section>

        <Section title="Service providers">
          {BRAND_NAME} uses Plaid to link banks (only if you opt in) and standard cloud
          infrastructure for hosting, authentication, and database storage. Providers process data
          only to run the service.
        </Section>

        <Section title="Your choices">
          You can disconnect any linked bank from Settings — this removes the access token and
          derived data. You can delete your account and all associated data at any time from
          Settings. You can email{" "}
          <a href={`mailto:${BRAND_CONTACT_EMAIL}`} className="underline hover:text-foreground">
            {BRAND_CONTACT_EMAIL}
          </a>{" "}
          for a copy of your data or with a privacy question.
        </Section>

        <Section title="Changes">
          If we materially change this policy, we will update the effective date above and, for
          account holders, send an email notice.
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
