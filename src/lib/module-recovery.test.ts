import { describe, expect, it } from "vitest";
import {
  MODULE_RECOVERY_QUERY_KEY,
  MODULE_RECOVERY_SCRIPT,
  MODULE_RECOVERY_STORAGE_KEY,
} from "./module-recovery";

describe("module startup recovery", () => {
  it("handles entry and dynamic-import failures with one bounded reload", () => {
    expect(MODULE_RECOVERY_SCRIPT).toContain('target.tagName === "SCRIPT"');
    expect(MODULE_RECOVERY_SCRIPT).toContain("Failed to fetch dynamically imported module");
    expect(MODULE_RECOVERY_SCRIPT).toContain("retryWindowMs = 60000");
    expect(MODULE_RECOVERY_SCRIPT).toContain("location.replace");
    expect(MODULE_RECOVERY_SCRIPT).toContain(MODULE_RECOVERY_STORAGE_KEY);
    expect(MODULE_RECOVERY_SCRIPT).toContain(MODULE_RECOVERY_QUERY_KEY);
    expect(MODULE_RECOVERY_SCRIPT).toContain("next.searchParams.has(queryKey)");
  });

  it("also recovers when the page remains inert without an explicit browser error", () => {
    expect(MODULE_RECOVERY_SCRIPT).toContain("dataset.tapHydrated");
    expect(MODULE_RECOVERY_SCRIPT).toContain("}, 8000)");
  });
});
