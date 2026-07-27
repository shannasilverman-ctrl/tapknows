// P-3 · composition-hierarchy
//
// The stale notice lives INSIDE the `tap-proof-disclosure` definition list —
// never a new competing banner bolted onto the proof surface.

import { describe, expect, it } from "vitest";
import { extractNotice, renderStaleProof } from "./proof-stale-fixture";

describe("P-3 stale notice placement", () => {
  it("is located between the disclosure list's opening tag and its </dl>", () => {
    const markup = renderStaleProof();
    const notice = extractNotice(markup);
    expect(notice).not.toBeNull();

    const listStart = markup.indexOf('<dl class="tap-proof-disclosure">');
    const listEnd = markup.indexOf("</dl>");
    const noticeAt = markup.indexOf(notice!);

    expect(listStart).toBeGreaterThan(-1);
    expect(listEnd).toBeGreaterThan(listStart);
    expect(noticeAt).toBeGreaterThan(listStart);
    expect(noticeAt).toBeLessThan(listEnd);
  });

  it("introduces no competing banner outside the disclosure list", () => {
    const markup = renderStaleProof();
    const listEnd = markup.indexOf("</dl>");
    const afterList = markup.slice(listEnd);

    // The honest sentence appears once, inside the list — nowhere after it.
    expect(afterList).not.toContain("days old");
    expect(markup.match(/days old/g)?.length).toBe(1);
  });
});
