// P-2 · typography
//
// The rendered stale notice rides the proof sheet's EXISTING type scale, proven
// positively on rendered markup. Sentence completeness is asserted as content
// honesty only — the type-scale claim rests on (b) + (c) + (d), never on the
// sentence check.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PINNED_VERIFIED_ON, extractNotice, renderStaleProof } from "./proof-stale-fixture";

const CLASS_ALLOWLIST = ["text-muted-foreground"] as const;
const STYLESHEET = resolve(process.cwd(), "src/styles.css");

function noticeMarkup(): string {
  const notice = extractNotice(renderStaleProof());
  expect(notice).not.toBeNull();
  return notice!;
}

describe("P-2 stale notice typography", () => {
  it("(a) is one complete authored sentence naming the pinned date and the window", () => {
    const text = noticeMarkup()
      .replace(/<[^>]*>/g, "")
      .trim();

    expect(text).toContain(PINNED_VERIFIED_ON);
    expect(text).toContain("90 days");
    expect(text.endsWith(".")).toBe(true);

    // Exactly one sentence: one terminal period, and no mid-string sentence break.
    expect(text.match(/\./g)?.length).toBe(1);
    expect(text[0]).toBe(text[0].toUpperCase());
  });

  it("(b) sits inside the 'Rates verified' <dd>, whose type scale already exists", () => {
    const markup = renderStaleProof();

    // The notice is inside a <dd> that follows the "Rates verified" <dt>.
    const ratesBlock = markup.slice(markup.indexOf("Rates verified"), markup.indexOf("Valuation"));
    expect(ratesBlock).toContain('<span class="text-muted-foreground">');
    expect(ratesBlock).toContain("</dd>");

    // The pre-existing rule that defines that type scale must exist.
    const css = readFileSync(STYLESHEET, "utf8");
    expect(css).toMatch(/\.tap-proof-disclosure\s+dd\s*\{/);
  });

  it("(c) carries ONLY allowlisted classes, and the allowlist is real CSS", () => {
    const notice = noticeMarkup();
    const classAttrs = [...notice.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);

    // No class attribute must not pass trivially.
    expect(classAttrs.length).toBeGreaterThan(0);

    const tokens = classAttrs.flatMap((a) => a.split(/\s+/)).filter(Boolean);
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(CLASS_ALLOWLIST).toContain(token);
    }

    const css = readFileSync(STYLESHEET, "utf8");
    for (const allowed of CLASS_ALLOWLIST) {
      expect(css).toContain(`.${allowed}`);
    }
  });

  it("(d) carries no style attribute anywhere in its subtree", () => {
    expect(noticeMarkup()).not.toContain("style=");
  });
});
