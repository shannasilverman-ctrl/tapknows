# TAP Takeover Review — 2026-07-26

This is the written, pre-change takeover record for TAP. The reviewed baseline is commit `00323d7` (“Keep custom card rates in Wallet guides”), immediately after `a41a56a` (“Turn Wallet into a customer playbook”). No product change is proposed or made by this review.

The source of truth is [TAP Should Make the Payment Decision](../customer-experience/tap-customer-experience-report.html), whose manifest is [artifact.json](../customer-experience/artifact.json) and whose artifact id is `tap-customer-experience-report`. Its central conclusion is that TAP's job is to make a payment decision: Home should answer the purchase at hand, Wallet should teach the durable rule, trust factors must be allowed to change the answer, and the product needs a learning loop that reveals where customers hesitate.

## Implemented

- **Home starts the core decision.** `/home` asks where the customer is paying, supports merchant search and common/quick-pick paths, loads the signed-in or guest wallet, and carries merchant/category context into Decide.
- **Decide recommends and explains a payment choice.** `/decide` uses the customer's wallet, purchase amount, merchant/category, offers, valuations, and benefit context to rank card plays. It exposes proof and math, warns that interest can exceed rewards, and can change the displayed answer to cash or debit when a manually entered merchant card fee outweighs the estimated reward.
- **Plan evaluates a future purchase.** `/plan` compares wallet cards and offers for an amount and category, exposes the recommendation math and assumptions, accounts for supported caps and utilization preferences, identifies a possible wallet addition, and lets signed-in customers save a plan to their log.
- **Wallet teaches a playbook.** `/cards` presents situation-first wallet roles and opens the shared `WalletCardBriefing` used from Wallet and Home. The rebuild in `a41a56a` added sourced card guides with earn rates, verified travel and purchase benefits, available credits, fees, caps, dates, and issuer terms. `00323d7` preserved user-entered earn rates in custom-card guides and explicitly distinguishes those rates and benefits from independently verified catalog data.
- **Purchases records outcomes.** `/purchases` lists saved purchases, shows the card used and the recommended card, reports potential missed value, and supports logging a purchase with a recommendation preview.
- **A customer-system end-to-end suite already exists.** `e2e/product-system.spec.ts` covers the Home wallet, the Wallet briefing and sourced guide, merchant search into Decide, recommendation proof, a fee-driven cash/debit answer, onboarding, and installed-app start/shortcut behavior. `e2e/consumer-visual.spec.ts` also maintains route-level visual coverage. These tests establish current behavior; they do not eliminate the recommendation-consistency or measurement gaps below.

The report's journey audit also records a first implementation pass around six high-impact frictions: rewards had ignored merchant fees; a primary CTA claimed an unavailable wallet action; guest Alerts/Settings unexpectedly led to sign-in; the installed app opened on marketing instead of the core task; the interest warning was missing; and feedback categories were too broad. Current code and end-to-end checks show responses to several of these problems, but the report correctly treats continued measurement and consistency as unfinished work.

## What Remains

The report's six Recommended Next Steps remain the takeover backlog:

1. **Instrument the decision funnel:** measure wallet ready → merchant selected → recommendation viewed → proof opened → payment choice recorded → next purchase started.
2. **Instrument the learning loop:** measure Wallet opened → situation tried → card guide opened → benefit detail opened → next recommendation completed.
3. **Measure decision confidence by journey stage:** retain the improved third-use prompt and report responses by journey stage and wallet size, so confidence can be tied to the point of hesitation rather than broad engagement.
4. **Add merchant-level fee memory:** let a customer record a merchant surcharge once and have TAP warn automatically on the next decision at that merchant.
5. **Expand verified benefit coverage deliberately:** label cards without sourced benefit data as “not yet verified”; never let an empty registry imply that a card has no benefits.
6. **Test the ethical guardrail:** measure whether interest and surcharge guidance improves trust without reducing comprehension or completion.

One repository-audit item must precede or accompany that work: **consolidate the three recommendation implementations.** `src/lib/recommender.ts`, `src/lib/planner.ts`, and `src/lib/recommendationEngine.ts` contain independent recommendation and earn-value logic. No single engine yet guarantees that Home/Decide, Plan/Onboarding, Wallet-related helpers, and Purchases apply the same fee, cap, offer, benefit, valuation, and fallback rules.

## Risks

1. **The same purchase can receive different answers on different TAP surfaces.**
   - `src/lib/recommender.ts` is the oldest implementation and is consumed only by `src/routes/purchases.tsx` for the purchase-log preview.
   - `src/lib/planner.ts` owns `planPurchase` and independent earn/offer/benefit math used by `src/routes/decide.tsx`. `src/components/see-the-math.tsx`, `src/components/recommendation-proof.tsx`, and `src/lib/priorities.ts` import its display types rather than establishing shared decision logic.
   - `src/lib/recommendationEngine.ts` is the shared pure engine consumed directly by `src/routes/plan.tsx` and `src/routes/onboarding.tsx`, and by the Plan ecosystem through `src/lib/walletUpsell.ts`, `src/lib/capReached.ts`, and `src/lib/utilizationFilter.ts`.

   These implementations differ in inputs, fallback categories, cap handling, offer and benefit treatment, and output shapes. Fixing or testing one path does not prove the others. Divergence is the top structural risk because it undermines TAP's core promise of one trustworthy payment decision.

2. **Financial guardrails are not yet consistently decision inputs.** Decide can compare a manually supplied surcharge with reward value, but TAP does not remember that fee at the merchant level and the other recommendation paths are not thereby proven to use it. Interest is disclosed in proof text, but revolving-balance or interest risk is not a shared engine input that can change every recommendation. TAP can therefore optimize nominal rewards when cash or debit would be the safer customer answer.

3. **Missing data can be mistaken for negative evidence.** The verified-benefit registry is intentionally incomplete. Unless every surface explicitly says “not yet verified,” a card with no sourced TAP entry can appear to have no benefits. That can distort both the recommendation and customer trust; rates, benefits, protections, verification dates, and issuer-source links also age and require deliberate maintenance.

4. **Without the funnel and learning-loop instrumentation, regressions can look healthy.** Broad engagement cannot reveal whether customers are stuck finding a merchant, adding cards, trusting the pick, remembering the Wallet rule, or understanding the math. The team could improve clicks while worsening time-to-decision or confidence at a critical journey stage.
