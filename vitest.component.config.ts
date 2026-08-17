import { svelte } from "@sveltejs/vite-plugin-svelte";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * COMPONENT TIER — every state a widget can be in, rendered in a real Chromium.
 *
 * The unit tier (`tests/**\/*.story.test.ts`, jsdom) owns claims that are pure
 * logic: which notifications the bridge acts on, whether a display mode is
 * requested. It cannot own rendering claims, because mountly mounts widgets
 * into a shadow root and jsdom silently falls back to the light DOM — a test
 * that passes there is asserting something weaker than production.
 *
 * This tier also gives framework components their compiler, which is what makes
 * a real `.svelte` or `.vue` widget testable at all.
 *
 *   pnpm test:component
 */
export default defineConfig({
  plugins: [vue(), svelte()],
  test: {
    name: "component",
    include: ["tests/component/**/*.component.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
