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

  test("keeps the warm paper canvas and physical wallet on home", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto("/home");

    await expect(page.getByRole("heading", { name: "Where are you paying?" })).toBeVisible();
    // 2026-07-27, operator decision: the light/dark split stays, but the seams
    // become deliberate. Home opens with the landing's warm cream washing into
    // #fffdf8 paper, so the canvas assertion moves from pure white to the
    // paper tone. The physical wallet and the rest of the canvas law stand.
    await expect(page.locator(".tap-app-shell")).toHaveCSS(
      "background-color",
      "rgb(255, 253, 248)",
    );
    await expect(page.locator(".tap-physical-wallet")).toBeVisible();
    await expect(page.locator(".tap-leather-pocket")).toBeVisible();
    await expect(page.locator(".cs-face")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alerts" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("hydrates returning-customer totals without loading Plaid before consent", async ({
    page,
  }) => {
    const browserProblems: string[] = [];
    page.on("pageerror", (error) => browserProblems.push(String(error)));
    page.on("console", (message) => {
      const text = message.text();
      if (
        message.type() === "error" ||
        text.includes("hydrated but some attributes") ||
        text.includes("Plaid link-initialize.js script was embedded more than once")
      ) {
        browserProblems.push(text);
      }
    });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "tap_recovered_v1",
        JSON.stringify({
          entries: [{ at: new Date().toISOString(), cents: 1234 }],
        }),
      );
    });

    await page.goto("/home");

    await expect(page.getByText("$12.34", { exact: true })).toBeVisible();
    await expect(page.locator('script[src*="cdn.plaid.com/link/"]')).toHaveCount(0);
    expect(browserProblems).toEqual([]);
  });

  test("hydrates the sign-in form without mismatched markup", async ({ page }) => {
    const hydrationProblems: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("hydrated but some attributes")) {
        hydrationProblems.push(message.text());
      }
    });

    await page.goto("/login");

    await expect(page.getByText("Continue with Apple")).toBeVisible();
    expect(hydrationProblems).toEqual([]);
  });

  test("turns Wallet into a briefing and opens the same sourced card guide", async ({ page }) => {
    await page.goto("/cards");

    await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Know what every card is for." })).toBeVisible();
    await expect(page.getByText("Groceries", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Gold", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open Chase Sapphire Preferred card guide" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Open Chase Sapphire Preferred card guide" }).click();
    await expect(page).toHaveURL(/\/cards\?card=guest_chase/);
    await expect(page.getByText("Travel ready", { exact: true })).toBeVisible();
    await expect(page.getByText("No foreign transaction fee", { exact: true })).toBeVisible();
    await expect(page.getByText("Emergency evacuation", { exact: true })).toBeVisible();
    await expect(page.getByText("3x", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Gas & EV charging", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Back to wallet" }).click();
    await expect(page).toHaveURL(/\/cards$/);
    await expect(page.getByRole("heading", { name: "Know what every card is for." })).toBeVisible();
  });

  test("expands online shopping into merchant choices without losing search", async ({ page }) => {
    await page.goto("/home");
    const search = page.getByRole("textbox");
    await expect(search).toBeVisible();

    await page.getByRole("button", { name: "Show common online stores" }).click();
    await expect(search).toHaveAttribute("placeholder", "Search Amazon, Target, any online store…");
    await expect(page.getByRole("button", { name: "Amazon.com", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Walmart.com", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Target.com", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "BestBuy.com", exact: true })).toBeVisible();

    await search.fill("Nike");
    await expect(page.getByText("Nike", { exact: true })).toBeVisible();
    await search.fill("");
    await expect(page.getByRole("button", { name: "Amazon.com", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Amazon.com", exact: true }).click();
    await expect(page).toHaveURL(/\/decide\?merchant=local_amazon/);
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

  test("keeps an easy back action visible throughout the recommendation", async ({ page }) => {
    await page.goto("/decide?merchant=local_amazon&amount=84&fromStack=1");
    const back = page.getByRole("button", { name: "Back to merchant search" });
    await expect(back).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(back).toBeVisible();
    const box = await back.boundingBox();
    expect(box?.y ?? 999).toBeLessThan(100);

    await back.click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Where are you paying?" })).toBeVisible();
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
    await page.addInitScript(() => {
      window.localStorage.removeItem("card_savvy_guest_wallet_v1");
    });
    await page.goto("/onboarding");
    await expect(page.locator(".tap-onboarding")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.getByRole("heading", { name: "Build your wallet." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try demo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect your bank" })).toBeVisible();
  });

  test("shows its work before revealing the onboarding recommendation", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Build your wallet." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Set your priorities." })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "See it work." })).toBeVisible();
    const restaurantSample = page.getByRole("button", { name: "$60 at a restaurant" });
    await restaurantSample.click();

    await expect(page.locator(".tap-onboarding-evaluation")).toBeVisible();
    await expect(restaurantSample).toBeDisabled();
    await expect(page.getByText("TAP is comparing your cards")).toBeVisible();
    await expect(page.locator(".tap-onboarding-result")).toBeVisible();
    await expect(page.locator(".tap-onboarding-evaluation")).toHaveCount(0);
  });

  // ── benefit honesty ──────────────────────────────────────────────────────
  // An empty benefit list must read as "TAP has not checked", never as
  // "this card has no benefits".

  test("labels a card with no sourced benefits as not yet verified", async ({ page }) => {
    await page.goto("/cards?card=guest_citi");
    await expect(page.getByTestId("benefits-unverified-label")).toBeVisible();
    await expect(page.getByText("Not yet verified in TAP", { exact: true })).toBeVisible();

    // A card TAP has verified must NOT carry the label.
    await page.goto("/cards?card=guest_chase");
    await expect(page.getByTestId("benefits-unverified-label")).toHaveCount(0);
  });

  test("renders the exact unverified copy at both viewports", async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/cards?card=guest_citi");

      const label = page.getByTestId("benefits-unverified-label");
      await expect(label).toBeVisible();
      // Exact copy — one sentence, never improvised.
      await expect(label).toHaveText("Not yet verified in TAP");

      // Never visually truncated at this viewport.
      const fits = await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(fits).toBe(true);
    }
  });

  test("keeps the unverified label inside benefits, not floated elsewhere", async ({ page }) => {
    await page.goto("/cards?card=guest_citi");

    const benefits = page.getByTestId("card-briefing-benefits");
    await expect(benefits).toBeVisible();
    // Scope the assertion to the benefits container: the label must live there.
    await expect(benefits.getByTestId("benefits-unverified-label")).toBeVisible();
    await expect(benefits.getByText("Not yet verified in TAP", { exact: true })).toBeVisible();
  });

  // ── merchant fee memory ──────────────────────────────────────────────────

  test("remembers a merchant surcharge without re-entering it", async ({ page }) => {
    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");
    await page.getByRole("button", { name: "$84.00", exact: true }).click();
    await page.getByRole("switch", { name: "Merchant charges a card fee" }).click();
    await page.getByRole("spinbutton", { name: "Card fee percentage" }).fill("5");
    await page.getByRole("button", { name: "Done" }).click();

    // Come back to the same merchant fresh — the fee returns on its own.
    // The amount button now advertises the remembered fee, so match by prefix.
    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");
    await page.getByRole("button", { name: /^\$84\.00/ }).click();
    await expect(page.getByRole("spinbutton", { name: "Card fee percentage" })).toHaveValue("5");
    await page.getByRole("button", { name: "Done" }).click();

    // A merchant never fee-tagged stays clean.
    await page.goto("/decide?merchant=local_amazon&amount=84");
    await page.getByRole("button", { name: /^\$84\.00/ }).click();
    await expect(page.getByRole("switch", { name: "Merchant charges a card fee" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("surfaces a remembered fee notice on the recommendation", async ({ page }) => {
    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");
    await page.getByRole("button", { name: "$84.00", exact: true }).click();
    await page.getByRole("switch", { name: "Merchant charges a card fee" }).click();
    await page.getByRole("spinbutton", { name: "Card fee percentage" }).fill("4");
    await page.getByRole("button", { name: "Done" }).click();

    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");
    const notice = page.getByTestId("remembered-fee-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("4%");
  });

  // ── journey instrumentation ──────────────────────────────────────────────

  test("emits journey events from each consumer surface", async ({ page }) => {
    const readSink = () =>
      page.evaluate(() => {
        const sink = (window as unknown as Record<string, unknown>).__tapJourneyEvents;
        return Array.isArray(sink) ? (sink as { name: string }[]).map((r) => r.name) : [];
      });

    // Home — a decision-funnel event once the wallet is ready.
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Where are you paying?" })).toBeVisible();
    await expect.poll(readSink).toContain("wallet_ready");

    // Decide — the recommendation reached the customer.
    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");
    await expect(page.locator(".tap-decision-core")).toBeVisible();
    await expect.poll(readSink).toContain("recommendation_viewed");

    // Decide — opening the proof sheet is the funnel's fourth step.
    await page.locator(".tap-proof-trigger").first().click();
    await expect.poll(readSink).toContain("proof_opened");

    // Wallet playbook — the learning loop.
    await page.goto("/cards?card=guest_chase");
    await expect(page.getByText("Travel ready", { exact: true })).toBeVisible();
    await expect.poll(readSink).toContain("card_guide_opened");
  });

  // ── staged feedback ──────────────────────────────────────────────────────

  test("presents four journey stages in the feedback sheet", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("tap.feedbackDue", "1");
      window.localStorage.removeItem("tap.feedbackShown");
    });
    await page.goto("/home");

    const stages = page.getByTestId("feedback-stages");
    await expect(stages).toBeVisible();
    for (const label of [
      "Finding the store",
      "Adding cards",
      "Trusting the pick",
      "Understanding the math",
    ]) {
      await expect(stages.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await expect(stages.getByRole("button")).toHaveCount(4);
  });

  test("records the broken stage the customer selects", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("tap.feedbackDue", "1");
      window.localStorage.removeItem("tap.feedbackShown");
    });
    await page.goto("/home");
    await expect(page.getByTestId("feedback-stages")).toBeVisible();

    const readStage = () =>
      page.evaluate(
        () => (window as unknown as Record<string, unknown>).__tapFeedbackStage ?? null,
      );

    // Each of the four in turn — the recorded stage is always the selected one.
    for (const [id, label] of [
      ["finding_merchant", "Finding the store"],
      ["setting_up_cards", "Adding cards"],
      ["trusting_the_pick", "Trusting the pick"],
      ["understanding_the_math", "Understanding the math"],
    ] as const) {
      await page.getByTestId(`feedback-stage-${id}`).click();
      await expect(page.getByTestId(`feedback-stage-${id}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect.poll(readStage).toBe(id);
      // Confirm the visible label belongs to the id that got recorded.
      await expect(page.getByTestId(`feedback-stage-${id}`)).toHaveText(label);
    }
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
