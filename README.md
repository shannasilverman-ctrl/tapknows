# TAP

TAP answers one checkout question: **which card should I use here?**

It compares the cards a customer already carries, the purchase, current card
terms, and relevant caps or fees. It then shows one recommendation, the
runner-up, and the math behind the choice.

- Production: <https://tapknows.com>
- Design principles: [DESIGN.md](./DESIGN.md)
- Customer-experience review:
  [docs/customer-experience/tap-customer-experience-report.html](./docs/customer-experience/tap-customer-experience-report.html)

TAP is independent and is not affiliated with or endorsed by a card issuer,
payment network, or Apple. Card rewards and terms can change; customers should
verify material terms with their issuer.

## Local development

TAP requires Node.js 22 or newer.

```bash
npm ci
cp .env.example .env
npm run dev
```

Populate the public Supabase URL and publishable key for interactive local
development. Keep service-role, Plaid, and other server secrets out of source
control.

## Quality gates

```bash
npm run check
npm run test:e2e
```

`npm run check` verifies formatting, lint, types, unit and integration tests,
and the production build. The end-to-end command starts its own isolated local
server with non-secret test configuration. To validate an immutable preview or
production deployment instead:

```bash
TAP_BASE_URL=https://preview.example.workers.dev npm run test:e2e
```

## Release discipline

1. Work on a focused branch and keep unrelated local files out of the change.
2. Pass the local quality and end-to-end gates.
3. Build and deploy a separate immutable preview.
4. Run the full end-to-end suite against that exact preview.
5. Record the current production Worker version as the rollback target.
6. Promote only the tested commit and smoke-test both `tapknows.com` and
   `www.tapknows.com`.

Runtime values belong in Cloudflare Worker configuration, never in Git or
generated deployment archives.
