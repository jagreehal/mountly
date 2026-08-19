// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { bootstrapMountly } from "../packages/mountly/src/runtime.js";

describe("bootstrapMountly without React", () => {
  it("does not throw when manifest only includes Vue imports", async () => {
    const manifest = {
      platform: {
        imports: {
          vue: "https://cdn.example.com/vue.js",
          mountly: "https://cdn.example.com/mountly.js",
          "mountly-manifest": "https://cdn.example.com/mountly-manifest.js",
          "mountly-vue": "https://cdn.example.com/mountly-vue.js",
        },
      },
      verticals: [],
    };

    await expect(
      bootstrapMountly(manifest, { define: false }),
    ).resolves.toBeDefined();
  });

  it("does not throw when manifest only includes Svelte imports", async () => {
    const manifest = {
      platform: {
        imports: {
          svelte: "https://cdn.example.com/svelte.js",
          mountly: "https://cdn.example.com/mountly.js",
          "mountly-manifest": "https://cdn.example.com/mountly-manifest.js",
          "mountly-svelte": "https://cdn.example.com/mountly-svelte.js",
        },
      },
      verticals: [],
    };

    await expect(
      bootstrapMountly(manifest, { define: false }),
    ).resolves.toBeDefined();
  });

  it("still works when React imports are present", async () => {
    const manifest = {
      platform: {
        imports: {
          react: "https://cdn.example.com/react.js",
          "react-dom": "https://cdn.example.com/react-dom.js",
          "react-dom/client": "https://cdn.example.com/react-dom-client.js",
          mountly: "https://cdn.example.com/mountly.js",
          "mountly-manifest": "https://cdn.example.com/mountly-manifest.js",
        },
      },
      verticals: [],
    };

    await expect(
      bootstrapMountly(manifest, { define: false }),
    ).resolves.toBeDefined();
  });
});
