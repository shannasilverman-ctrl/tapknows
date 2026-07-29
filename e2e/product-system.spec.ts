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
    await expect(page.getByText("Recovered this month", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/card credits you haven't used/i)).toHaveCount(0);
    await expect(page.getByText(/potential card credits to check/i)).toBeVisible();
    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    await expect(primaryNav.getByRole("link", { name: "Plan", exact: true })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Cheat sheet", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("uses the screen intentionally on desktop without changing the mobile checkout tool", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/home");

    const workspace = page.getByRole("complementary", { name: "TAP workspace" });
    await expect(workspace).toBeVisible();
    await expect(workspace.getByRole("link", { name: "Decide" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(workspace.getByRole("link", { name: "Plan", exact: true })).toBeVisible();
    await expect(workspace.getByRole("link", { name: "Cheat sheet", exact: true })).toBeVisible();
    await expect(page.locator(".tap-home-core")).toHaveCSS("display", "grid");

    await workspace.getByRole("link", { name: "Wallet" }).click();
    await expect(page).toHaveURL(/\/cards$/);
    await expect(workspace.getByRole("link", { name: "Wallet" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator(".tap-consumer-screen > nav")).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(workspace).toBeHidden();
    await expect(page.locator(".tap-consumer-screen > nav")).toBeVisible();
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

  test("recovers once when the browser drops an application module", async ({ page }) => {
    let droppedModules = 0;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (droppedModules === 0 && request.resourceType() === "script") {
        droppedModules += 1;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto("/onboarding");

    await expect(page.locator("html")).toHaveAttribute("data-tap-hydrated", "true", {
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Continue/ })).toBeEnabled();
    await expect(page).not.toHaveURL(/_tap_retry=/);
    expect(droppedModules).toBe(1);
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

  test("keeps catalog rate semantics and verification dates honest", async ({ page }) => {
    await page.goto("/cards");
    await page.getByRole("button", { name: "Add a card" }).click();

    await expect(page.getByText(/Rates verified Jul 12, 2026/)).toBeVisible();
    await page.getByRole("button", { name: "Amazon Prime Visa No annual fee" }).click();

    await expect(page.getByText("5% amazon", { exact: true })).toBeVisible();
    await expect(page.getByText("2% gas", { exact: true })).toBeVisible();
    await expect(page.getByText("1% everything else", { exact: true })).toBeVisible();
    await expect(page.getByText(/0\\.0[125]x/)).toHaveCount(0);
  });

  test("labels issuer credit balances as assumed rather than known", async ({ page }) => {
    await page.goto("/cards?card=guest_amex");

    await expect(page.getByText("Credits to check", { exact: true })).toBeVisible();
    await expect(page.getByText(/TAP cannot see your issuer credit usage/)).toBeVisible();
    await expect(page.getByText(/Up to \$10\.00 assumed remaining/).first()).toBeVisible();
    await expect(page.getByText(/\$10\.00 left/)).toHaveCount(0);
    await expect(page.getByText(/choose “Mark used” to update the estimate/)).toBeVisible();
  });

  test("turns the wallet into a searchable, printable card cheat sheet", async ({ page }) => {
    const browserProblems: string[] = [];
    page.on("pageerror", (error) => browserProblems.push(String(error)));
    await page.goto("/cheat-sheet");

    await expect(page.getByRole("heading", { name: "Your one-glance card plan." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your everyday answers" })).toBeVisible();
    await expect(page.locator(".tap-cheat-row")).toHaveCount(10);
    await expect(page.getByText("Rules checked", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Card terms checked", { exact: false })).toBeVisible();

    const search = page.getByRole("textbox", { name: "Search your card plan" });
    await search.fill("Dining");
    await expect(page.locator(".tap-cheat-row")).toHaveCount(1);
    const diningAnswer = page.getByRole("article");
    await expect(diningAnswer.getByRole("heading", { name: "Dining" })).toBeVisible();
    await expect(diningAnswer.getByText("Gold", { exact: true })).toBeVisible();
    await expect(diningAnswer.getByText("4× points", { exact: true })).toBeVisible();

    await search.fill("not in my plan");
    await expect(page.getByText("No card-plan matches for “not in my plan”.")).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.getByRole("heading", { name: "Your front-of-wallet cards" })).toBeVisible();
    const workspace = page.getByRole("complementary", { name: "TAP workspace" });
    await expect(workspace.getByRole("link", { name: "Cheat sheet" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
    await expect(page.locator(".tap-cheat-carry")).toBeHidden();
    expect(browserProblems).toEqual([]);
  });

  test("shows point assumptions in cents without multiplying them twice", async ({ page }) => {
    await page.goto("/plan");
    await page.getByPlaceholder("400.00").fill("100");
    await page.getByRole("button", { name: "dining", exact: true }).click();

    await expect(page.getByText(/at 2.00¢ per point/)).toBeVisible();
    await expect(page.getByText(/200.00¢ per point/)).toHaveCount(0);
  });

  test("shows the complete recommendation math before asking for trust", async ({ page }) => {
    await page.goto("/decide?merchant=whole_foods&category=groceries&amount=84");

    await page
      .getByRole("button", {
        name: "Why Gold? vs Sapphire Preferred: est. $1.72 · +$5.00 Cap status unknown",
      })
      .click();

    const proof = page.getByRole("region", { name: "Recommendation proof" });
    await expect(proof).toBeVisible();
    await expect(proof.getByText("On a $84.00 purchase", { exact: true })).toBeVisible();
    await expect(proof.getByRole("heading", { name: "Gold", exact: true })).toBeVisible();
    await expect(proof.getByRole("heading", { name: "Sapphire Preferred" })).toBeVisible();
    await expect(proof.getByText("$6.72", { exact: true })).toBeVisible();
    await expect(proof.getByText("$1.72", { exact: true })).toBeVisible();
    await expect(proof.getByText("Estimated difference", { exact: true })).toBeVisible();
    await expect(proof.getByText("= $5.00", { exact: true })).toBeVisible();
    await expect(proof.getByText("336 pts × 2.00¢ = est. $6.72", { exact: true })).toBeVisible();
    await expect(proof.getByText("84 pts × 2.05¢ = est. $1.72", { exact: true })).toBeVisible();
    await expect(proof.getByText(/Amex Membership Rewards: 2.00¢\/pt/)).toBeVisible();
    await expect(proof.getByText(/Chase Ultimate Rewards: 2.05¢\/pt/)).toBeVisible();
    await expect(proof.getByText(/interest can cost more than the rewards/i)).toBeVisible();
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
    await expect(page.getByText("See your best card", { exact: true })).toBeVisible();
    await expect(page.locator(".tap-device-stage")).toHaveCSS("overflow-x", "hidden");
    await expect(page.getByRole("link", { name: "Try this decision" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Edit assumptions" })).toHaveCount(0);
    await expect(page.getByText(/Amex: 2\.0¢\/pt · TAP default/)).toHaveCount(1);
    await expect(page.getByText(/Chase: 2\.05¢\/pt · TAP default/)).toHaveCount(1);
    await expect(page.getByText(/Amount won’t change this pick/i)).toHaveCount(0);

    const nextScreen = page.getByRole("button", { name: "Next product screen" });
    await expect(nextScreen).toBeEnabled();
    await expect(page.locator(".tap-card-line")).toHaveCount(0);
    const recommendationSpacing = await page.locator(".tap-device-winner").evaluate((winner) => {
      const walletBottom = winner
        .querySelector(".tap-wallet-mouth")!
        .getBoundingClientRect().bottom;
      const valueTop = winner.querySelector(".tap-choice-value")!.getBoundingClientRect().top;
      return valueTop - walletBottom;
    });
    expect(recommendationSpacing).toBeGreaterThanOrEqual(8);

    await nextScreen.click();
    await expect(page.getByText("Check the math", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next product screen" })).toBeDisabled();

    const previousScreen = page.getByRole("button", { name: "Previous product screen" });
    await previousScreen.click();
    await expect(page.getByText("See your best card", { exact: true })).toBeVisible();
    await previousScreen.click();
    await expect(page.getByText("Choose the place", { exact: true })).toBeVisible();
    await expect(previousScreen).toBeDisabled();

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
    await expect(page.getByText(/2\.00¢\/pt · TAP default/)).toBeVisible();
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
    const quickAdd = page.getByRole("button", { name: "Amex Gold", exact: true });
    const optionalSync = page.getByRole("button", { name: "Sync cards with Plaid" });
    await expect(quickAdd).toBeVisible();
    await expect(page.locator(".cs-quick-add-chip")).toHaveCount(4);
    await expect(optionalSync).toHaveCount(0);
    await page.getByRole("button", { name: "More ways to add cards" }).click();
    await expect(optionalSync).toBeVisible();
    const quickAddBox = await quickAdd.boundingBox();
    const optionalSyncBox = await optionalSync.boundingBox();
    expect(quickAddBox?.y ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      optionalSyncBox?.y ?? Number.MIN_SAFE_INTEGER,
    );
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
