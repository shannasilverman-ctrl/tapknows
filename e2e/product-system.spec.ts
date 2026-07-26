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
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alerts" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("turns the landing mockup into an interactive mobile walkthrough", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const walkthrough = page.getByRole("region", {
      name: "Swipe through the TAP product experience",
    });

    await expect(walkthrough).toBeVisible();
    await expect(page.getByText("Choose the place", { exact: true })).toBeVisible();
    await expect(page.locator(".tap-device-stage")).toHaveCSS("overflow-x", "hidden");
    await expect(page.getByRole("link", { name: "Try this decision" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Edit assumptions" })).toHaveCount(0);

    const nextScreen = page.getByRole("button", { name: "Next product screen" });
    await expect(nextScreen).toBeEnabled();
    await page.waitForTimeout(500);
    await nextScreen.click();
    await expect(page.getByText("See your best card", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Why this card?" }).click();
    await expect(page.getByText("Check the math", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next product screen" })).toBeDisabled();

    const walletFaces = page.locator(".tap-wallet-board .tap-mini-card .cs-face");
    await expect(walletFaces).toHaveCount(3);
    await expect(page.locator(".tap-wallet-board .cs-chip")).toHaveCount(3);
    const aspectRatio = await walletFaces.first().evaluate((face) => {
      const rect = face.getBoundingClientRect();
      return rect.width / rect.height;
    });
    expect(aspectRatio).toBeGreaterThan(1.5);
    expect(aspectRatio).toBeLessThan(1.67);
  });

  test("carries the wallet into the recommendation and exposes proof", async ({ page }) => {
    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");

    await expect(page.locator(".tap-decision-core")).toBeVisible();
    await expect(page.locator(".tap-leather-pocket")).toBeVisible();
    await expect(page.locator('.tap-contactless-signal[data-visible="true"]')).toBeVisible();

    const proof = page.getByRole("button", { name: /Why .*\\?/i });
    await proof.click();
    await expect(page.getByText("TAP never recommends a card because it pays us.")).toBeVisible();
    await expect(page.getByText(/interest can cost more than the rewards/i)).toBeVisible();
    await expect(page.getByText(/Rates verified/)).toBeVisible();
  });

  test("puts a card surcharge ahead of rewards when cash or debit wins", async ({ page }) => {
    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");

    await page.getByRole("button", { name: "$84.00", exact: true }).click();
    await page.getByRole("switch", { name: "Merchant charges a card fee" }).click();
    await page.getByRole("spinbutton", { name: "Card fee percentage" }).fill("10");
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("heading", { name: "Use cash or debit." })).toBeVisible();
    await expect(page.getByText(/card fee costs \$8\.40/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "I’ll use cash or debit" })).toBeVisible();
  });

  test("uses the editorial system throughout onboarding", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.locator(".tap-onboarding")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.getByRole("heading", { name: "Build your wallet." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try demo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect your bank" })).toBeVisible();
  });

  test("opens the installed app on the core task and exposes useful shortcuts", async ({
    request,
  }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();

    expect(manifest.start_url).toBe("/home?source=pwa");
    expect(manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url)).toEqual([
      "/home?source=shortcut",
      "/cards?source=shortcut",
      "/plan?source=shortcut",
    ]);
  });
});
