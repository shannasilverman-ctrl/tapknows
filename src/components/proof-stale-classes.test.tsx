// P-4 · color-contrast
//
// Stale-state styling can only ride the stylesheet's EXISTING class vocabulary,
// proven three ways:
//   (a) rendered-markup allowlist on the notice and its whole subtree
//   (b) the allowlisted token remains wired to the audited contrast value
//   (c) source absence of inline hex / style= — enforced by the command
//
// Pinning the whole stylesheet made unrelated, legitimate product design work
// impossible. The focused token assertion closes the same contrast loophole
// without treating every layout or responsive rule as stale-proof code.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractNotice, renderStaleProof } from "./proof-stale-fixture";

const CLASS_ALLOWLIST = ["text-muted-foreground"] as const;
const STYLESHEET = resolve(process.cwd(), "src/styles.css");
const AUDITED_MUTED_FOREGROUND = "hsl(299 8% 44%)";

describe("P-4 stale-state styling rides existing class vocabulary", () => {
  it("(a) every class token on the notice subtree is allowlisted and real CSS", () => {
    const notice = extractNotice(renderStaleProof());
    expect(notice).not.toBeNull();

    const classAttrs = [...notice!.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
    expect(classAttrs.length).toBeGreaterThan(0); // never vacuously true

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

  it("(a) no style attribute appears anywhere in the rendered component", () => {
    expect(renderStaleProof()).not.toContain("style=");
  });

  it("(b) the allowlisted class remains wired to the audited contrast token", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    expect(css).toContain("--color-muted-foreground: var(--muted-foreground);");

    const token = css.match(/--muted-foreground:\s*([^;]+);/);
    expect(token?.[1]?.trim()).toBe(AUDITED_MUTED_FOREGROUND);
  });
});
