// P-4 · color-contrast
//
// Stale-state styling can only ride the stylesheet's EXISTING class vocabulary,
// proven three ways:
//   (a) rendered-markup allowlist on the notice and its whole subtree
//   (b) the stylesheet is byte-unchanged from law time (sha256 pinned here AND
//       independently re-verified by the criterion command via shasum)
//   (c) source absence of inline hex / style= — enforced by the command
//
// (b) is what closes the loophole a grep for hex alone would leave open: with
// the stylesheet byte-pinned, no new or altered rule can restyle an allowlisted
// class via rgb(), hsl(), or a named colour behind this test's back.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractNotice, renderStaleProof } from "./proof-stale-fixture";

const CLASS_ALLOWLIST = ["text-muted-foreground"] as const;
const STYLESHEET = resolve(process.cwd(), "src/styles.css");
const LAW_TIME_STYLESHEET_SHA256 =
  "379188155f581dc09583bf9f9963c31a2da176b100f8eb214c3825b50956fd22";

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

  it("(b) the stylesheet is byte-unchanged from law time", () => {
    const bytes = readFileSync(STYLESHEET);
    const digest = createHash("sha256").update(bytes).digest("hex");

    expect(digest).toBe(LAW_TIME_STYLESHEET_SHA256);
  });
});
