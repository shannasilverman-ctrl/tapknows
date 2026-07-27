// Visual coverage for the states the route-level sweep never reaches.
//
// consumer-visual.spec.ts snapshots each route on arrival. Several of TAP's
// most distinctive surfaces only exist AFTER an interaction, so they were never
// captured — and that is exactly where template-blue styling survived the
// re-skin unnoticed:
//
//   • /plan renders "Enter an amount to see the play" until an amount is typed,
//     so the card play — the gold cardstock and THE PLAY badge — was never in
//     any baseline. Both were rendering Card Savvy blue on the live site.
//   • /decide with an EMPTY wallet shows the "Add a card first" empty state.
//     The route sweep always injects a wallet, so that state was uncovered too;
//     its primary button was blue.
//
// These tests pin the post-interaction states so a colour or layout regression
// there fails a build instead of shipping.

import { expect, test } from "@playwright/test";

const guestWallet = {
  cards: [
    { id: "guest_amex", card_catalog_id: "amex_gold", nickname: null },
    { id: "guest_chase", card_catalog_id: "chase_csp", nickname: null },
    { id: "guest_citi", card_catalog_id: "citi_double_cash", nickname: null },
  ],
  offers: [],
  overrides: [],
  accounts: [],
  prefs: {
    utilization_enabled: false,
    utilization_threshold_pct: 10,
    utilization_behavior: "warn",
  },
};

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

test.describe("TAP interaction-state visuals", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const viewport of viewports) {
    test(`plan — the play — ${viewport.name}`, async ({ page }) => {
      await page.addInitScript((wallet) => {
        window.localStorage.setItem("card_savvy_guest_wallet_v1", JSON.stringify(wallet));
      }, guestWallet);
      await page.setViewportSize(viewport);
      await page.goto("/plan");

      // Drive to the state that actually renders the card play.
      await page.getByPlaceholder("400.00").fill("120");
      await page.getByRole("button", { name: "groceries", exact: true }).click();

      // The play is present once the badge and a cardstock have rendered.
      await expect(page.getByText("THE PLAY")).toBeVisible();
      await expect(page.locator(".cs-cardstock").first()).toBeVisible();

      await expect(page).toHaveScreenshot(`plan-play-${viewport.name}.png`, {
        animations: "disabled",
        caret: "hide",
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      });
    });
  }

  test("decide — empty wallet state — mobile", async ({ page }) => {
    // Deliberately NO wallet: this is the state the route sweep never sees.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");

    await expect(page.getByRole("heading", { name: "Add a card first" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Build your wallet" })).toBeVisible();

    await expect(page).toHaveScreenshot("decide-empty-wallet-mobile.png", {
      animations: "disabled",
      caret: "hide",
      fullPage: false,
      maxDiffPixelRatio: 0.01,
    });
  });
});
