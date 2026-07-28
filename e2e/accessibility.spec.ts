import AxeBuilder from "@axe-core/playwright";
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

const journeys = [
  { name: "landing", path: "/", ready: "Know before you tap." },
  { name: "onboarding", path: "/onboarding", ready: "Build your wallet." },
  { name: "home", path: "/home", ready: "Where are you paying?" },
  {
    name: "recommendation",
    path: "/decide?merchant=whole_foods&category=groceries&amount=84",
    ready: "Use Gold.",
  },
] as const;

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

test.describe("core WCAG acceptance", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((wallet) => {
      window.localStorage.setItem("card_savvy_guest_wallet_v1", JSON.stringify(wallet));
    }, guestWallet);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const journey of journeys) {
    for (const viewport of viewports) {
      test(`${journey.name} — ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(journey.path);
        await expect(page.getByRole("heading", { name: journey.ready })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-tap-hydrated", "true");
        if (journey.name === "onboarding") {
          await expect(page.getByRole("button", { name: /Continue/ })).toBeEnabled();
        }
        if (journey.name === "home") {
          await expect(page.locator('[data-wallet-ready="true"]')).toBeVisible();
        }
        if (journey.name === "recommendation") {
          await expect(page.getByRole("button", { name: /using this card/ })).toBeVisible();
        }

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();

        expect(
          results.violations.map(({ id, impact, nodes }) => ({
            id,
            impact,
            nodes: nodes.map((node) => node.target),
          })),
        ).toEqual([]);
      });
    }
  }
});
