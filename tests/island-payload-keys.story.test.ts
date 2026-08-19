// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readIslandPayload } from "../packages/mountly/src/island.ts";

describe("island payload keys", () => {
  it("does not warn for activateOnMediaQuery", () => {
    const element = document.createElement("div");
    element.setAttribute(
      "data-mountly-island",
      JSON.stringify({
        id: "test",
        moduleId: "test-mod",
        trigger: "media",
        activateOnMediaQuery: "(min-width: 768px)",
      }),
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      readIslandPayload(element);
      const unknownKeyWarnings = warnSpy.mock.calls.filter(
        ([msg]) => typeof msg === "string" && msg.includes("unknown island payload key"),
      );
      expect(unknownKeyWarnings).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
