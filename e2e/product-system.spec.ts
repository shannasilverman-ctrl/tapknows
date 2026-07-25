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

test.describe("TAP product system", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((wallet) => {
      window.localStorage.setItem("card_savvy_guest_wallet_v1", JSON.stringify(wallet));
    }, guestWallet);
  });

  test("keeps the white canvas and physical wallet on home", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto("/home");

    await expect(page.getByRole("heading", { name: "Where are you paying?" })).toBeVisible();
    await expect(page.locator(".tap-app-shell")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.locator(".tap-physical-wallet")).toBeVisible();
    await expect(page.locator(".tap-leather-pocket")).toBeVisible();
    await expect(page.locator(".cs-face")).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test("carries the wallet into the recommendation and exposes proof", async ({ page }) => {
    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");

    await expect(page.locator(".tap-decision-core")).toBeVisible();
    await expect(page.locator(".tap-leather-pocket")).toBeVisible();
    await expect(page.locator('.tap-contactless-signal[data-visible="true"]')).toBeVisible();

    const proof = page.getByRole("button", { name: /Why .*\\?/i });
    await proof.click();
    await expect(page.getByText("TAP never recommends a card because it pays us.")).toBeVisible();
    await expect(page.getByText(/Rates verified/)).toBeVisible();
  });

  test("uses the editorial system throughout onboarding", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.locator(".tap-onboarding")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.getByRole("heading", { name: "Build your wallet." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect your bank" })).toBeVisible();
  });
});
