import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardFace } from "./card-face";

describe("CardFace number privacy", () => {
  it("does not invent last-four digits for a customer's card", () => {
    const markup = renderToStaticMarkup(<CardFace issuer="Example Bank" name="Rewards" />);

    expect(markup).not.toContain("cs-face-number");
    expect(markup).not.toContain("••••");
  });

  it("keeps explicit illustrative digits on marketing cards", () => {
    const markup = renderToStaticMarkup(
      <CardFace issuer="Example Bank" name="Rewards" last4="4821" />,
    );

    expect(markup).toContain("cs-face-number");
    expect(markup).toContain("4821");
  });
});
