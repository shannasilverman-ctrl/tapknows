import { describe, expect, it } from "vitest";
import { startInstance } from "./start";

describe("server request protection", () => {
  it("installs TanStack Start CSRF protection for server functions", async () => {
    const options = await startInstance.getOptions();
    const csrfMarker = Symbol.for("tanstack-start:csrf-middleware");

    expect(options.requestMiddleware?.some((middleware) => csrfMarker in middleware)).toBe(true);
  });
});
