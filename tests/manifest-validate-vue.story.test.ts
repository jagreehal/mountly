import { describe, it, expect } from "vitest";
import { validateManifest } from "../packages/mountly-manifest/src/validate.js";

describe("validateManifest for non-React hosts (bug 3)", () => {
  it("does not emit errors for missing React imports in a Vue-only manifest", () => {
    const manifest = {
      platform: {
        imports: {
          vue: "https://esm.sh/vue@3.5.0",
          "mountly-manifest": "https://esm.sh/mountly-manifest",
        },
      },
      verticals: [],
    } as any;

    const issues = validateManifest(manifest);
    const reactErrors = issues.filter((i) => i.level === "error" && i.message.includes("react"));

    expect(reactErrors).toHaveLength(0);

    // They should be warnings instead
    const reactWarnings = issues.filter(
      (i) => i.level === "warning" && i.message.includes("react"),
    );
    expect(reactWarnings.length).toBeGreaterThanOrEqual(1);
  });
});
