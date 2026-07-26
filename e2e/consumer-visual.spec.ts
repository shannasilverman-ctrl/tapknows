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

const routes = [
  { name: "landing", path: "/", heading: "Know before you tap." },
  { name: "onboarding", path: "/onboarding", heading: "Build your wallet." },
  { name: "home", path: "/home", heading: "Where are you paying?" },
  {
    name: "recommendation",
    path: "/decide?merchant=whole_foods&category=groceries&amount=84",
    heading: "Use Gold.",
  },
  { name: "cards", path: "/cards", heading: "Wallet" },
  { name: "plan", path: "/plan", heading: "Plan" },
  { name: "bonuses", path: "/bonuses", redirectTo: "/login" },
  { name: "offers", path: "/offers", redirectTo: "/login" },
  { name: "purchases", path: "/purchases", redirectTo: "/login" },
  { name: "alerts", path: "/alerts", redirectTo: "/login" },
  { name: "settings", path: "/settings", redirectTo: "/login" },
  { name: "login", path: "/login" },
  { name: "privacy", path: "/privacy", heading: "Privacy Policy" },
  { name: "terms", path: "/terms", heading: "Terms of Use" },
  { name: "demo", path: "/demo", readyText: "Beat 1 of 6" },
] as const;

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

test.describe("TAP consumer visual system", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((wallet) => {
      window.localStorage.setItem("card_savvy_guest_wallet_v1", JSON.stringify(wallet));
    }, guestWallet);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const route of routes) {
    for (const viewport of viewports) {
      test(`${route.name} — ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(route.path);
        await expect(page.locator("body")).toBeVisible();
        if ("redirectTo" in route && route.redirectTo) {
          await page.waitForURL(`**${route.redirectTo}`);
        }
        if ("heading" in route && route.heading) {
          await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
        }
        if ("readyText" in route && route.readyText) {
          await expect(page.getByText(route.readyText)).toBeVisible();
        }
        if (route.name === "home") {
          await expect(page.locator('[data-wallet-ready="true"]')).toBeVisible();
        }
        await expect(page).toHaveScreenshot(`${route.name}-${viewport.name}.png`, {
          animations: "disabled",
          caret: "hide",
          fullPage: false,
          maxDiffPixelRatio: 0.02,
        });
      });
    }
  }
});
