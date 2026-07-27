// P-1 · fidelity-to-requirement
//
// Rendered with a pinned stale date, a visible honest notice appears in the
// recommendation-proof disclosure the customer already opens. Asserted on the
// rendered markup, never on identifier presence.

import { describe, expect, it } from "vitest";
import {
  PINNED_FRESH_ON,
  PINNED_TODAY,
  PINNED_VERIFIED_ON,
  extractNotice,
  renderProof,
  renderStaleProof,
} from "./proof-stale-fixture";

describe("stale-rate notice on the proof surface", () => {
  it("renders a visible honest notice when the rates are stale", () => {
    const markup = renderStaleProof();
    const notice = extractNotice(markup);

    expect(notice).not.toBeNull();

    // Visible text, not a hidden node or a bare identifier.
    const text = notice!.replace(/<[^>]*>/g, "").trim();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(PINNED_VERIFIED_ON);
    expect(notice).not.toMatch(/aria-hidden="true"|hidden(=|\s|>)/);
  });

  it("renders the notice inside the disclosure the customer already opens", () => {
    const markup = renderStaleProof();

    // The notice must live in the proof disclosure, not somewhere else.
    const disclosure = markup.slice(
      markup.indexOf('<dl class="tap-proof-disclosure">'),
      markup.indexOf("</dl>"),
    );
    expect(disclosure).toContain("more than 90 days old");
  });

  it("renders NO notice when the rates are fresh", () => {
    const markup = renderProof(PINNED_FRESH_ON, PINNED_TODAY);

    expect(extractNotice(markup)).toBeNull();
    expect(markup).not.toContain("days old");
  });
});
