import { describe, expect, it } from "vite-plus/test";

describe("SSR guards", () => {
  describe("shadow.ts", () => {
    it("attachShadow throws when document is undefined", async () => {
      const { attachShadow } = await import("../packages/mountly/src/shadow");
      const fakeElement = {} as unknown as Element;
      expect(() => attachShadow(fakeElement, {})).toThrow("browser environment");
    });
  });

  describe("elements.ts", () => {
    it("defineMountlyFeature does not throw in SSR", async () => {
      const { defineMountlyFeature } = await import("../packages/mountly/src/elements");
      expect(() => defineMountlyFeature()).not.toThrow();
    });
  });

  describe("devtools.ts", () => {
    it("createDevtoolsPanel throws when document is undefined", async () => {
      const { createDevtoolsPanel } = await import("../packages/mountly/src/devtools");
      expect(() => createDevtoolsPanel()).toThrow("browser environment");
    });
  });
});
