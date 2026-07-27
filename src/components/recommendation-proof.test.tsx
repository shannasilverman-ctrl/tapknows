// SC-2 · the consequence is wired into the EXISTING customer surface.
//
// Renders the real component via renderToStaticMarkup under pinned inputs and
// proves both paths: fresh renders the disclosure date byte-identical to the raw
// termsDate with no staleness copy anywhere; stale renders the describeRateAge
// notice in that same <dd> with the bare-date-only rendering absent.

import { describe, expect, it } from "vitest";
import { describeRateAge } from "@/lib/rateAge";
import {
  PINNED_FRESH_ON,
  PINNED_TODAY,
  PINNED_VERIFIED_ON,
  renderProof,
} from "./proof-stale-fixture";

/** Inside the window relative to PINNED_FRESH_ON. */
const FRESH_TODAY = new Date("2026-07-26T00:00:00.000Z");

function disclosureOf(markup: string): string {
  return markup.slice(markup.indexOf('<dl class="tap-proof-disclosure">'), markup.indexOf("</dl>"));
}

/** The "Rates verified" <dd> content, between that <dt> and the next <dt>. */
function ratesDd(markup: string): string {
  const block = markup.slice(markup.indexOf("Rates verified"), markup.indexOf("Valuation"));
  return block.slice(block.indexOf("<dd>"), block.indexOf("</dd>") + 5);
}

describe("SC-2 rate age wired into the proof disclosure", () => {
  it("fresh: the disclosure renders the raw date byte-identically", () => {
    const markup = renderProof(PINNED_FRESH_ON, FRESH_TODAY);
    const dd = ratesDd(markup);

    // Byte-identical to the plain date rendering the snapshots already capture.
    expect(dd).toBe(`<dd>${PINNED_FRESH_ON}</dd>`);
    expect(describeRateAge(PINNED_FRESH_ON, FRESH_TODAY)).toBe(PINNED_FRESH_ON);
  });

  it("fresh: no staleness copy appears anywhere in the markup", () => {
    const markup = renderProof(PINNED_FRESH_ON, FRESH_TODAY);

    expect(markup).not.toContain("days old");
    expect(markup).not.toContain("last verified on");
    expect(markup).not.toContain("text-muted-foreground");
  });

  it("stale: the same <dd> renders the describeRateAge notice", () => {
    const markup = renderProof(PINNED_VERIFIED_ON, PINNED_TODAY);
    const dd = ratesDd(markup);
    const expected = describeRateAge(PINNED_VERIFIED_ON, PINNED_TODAY);

    expect(dd).toContain(expected);
    expect(disclosureOf(markup)).toContain(expected);
  });

  it("stale: the bare-date-only rendering is absent", () => {
    const markup = renderProof(PINNED_VERIFIED_ON, PINNED_TODAY);

    // The raw-constant path is gone: the <dd> is no longer just the date.
    expect(ratesDd(markup)).not.toBe(`<dd>${PINNED_VERIFIED_ON}</dd>`);
  });
});
