import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { build } from "vite-plus";

/**
 * Build a View from `files` and mount it into a bare page — no server and no
 * origin, exactly what a host's srcdoc iframe gives the View. Inside the repo so
 * framework imports (`vue`) resolve.
 */
async function buildAndMount(
  page: Page,
  files: Record<string, string>,
  plugins: unknown[] = [],
): Promise<void> {
  mkdirSync("test-results", { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), "test-results", "mcp-worker-"));
  try {
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), source);
    }
    writeFileSync(join(dir, "bridge.js"), "");
    // Dynamic: the source uses import.meta, which Playwright's CJS loader rejects statically.
    const { mountlyMcpViews } = await import("../packages/mcp-apps/src/vite/index.js");
    await build({
      root: dir,
      logLevel: "silent",
      plugins: [
        ...plugins,
        mountlyMcpViews({
          entry: join(dir, "src/view.ts"),
          uri: "ui://w/view",
          name: "w",
          bridgeRuntimePath: join(dir, "bridge.js"),
        }),
      ],
    } as never);
    await page.setContent(readFileSync(join(dir, "dist/w.html"), "utf8"));
    await page.evaluate(() => {
      const root = document.createElement("output");
      document.body.append(root);
      (
        globalThis as never as { __mountlyMcpView__: { mount(el: Element): void } }
      ).__mountlyMcpView__.mount(root);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const WORKER = {
  // A worker with its own import: the inline bundle has to carry the graph.
  "src/double.ts": `export const double = (n: number) => n * 2;`,
  "src/worker.ts": `import { double } from "./double";
self.onmessage = (e: MessageEvent<number>) => self.postMessage("worker " + double(e.data));`,
};

test("a View's module worker runs from inside the single HTML document", async ({ page }) => {
  await buildAndMount(page, {
    ...WORKER,
    "src/view.ts": `const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
// Retired: new Worker(new URL("./deleted.ts", import.meta.url));
const note = "new Worker(new URL('./also-deleted.ts', import.meta.url))";
globalThis.__mountlyMcpView__ = {
  mount(c) { worker.onmessage = (e) => { c.textContent = e.data + " | " + note; }; worker.postMessage(21); },
  unmount() { worker.terminate(); },
};`,
  });
  // Only the real call is rewritten: the comment imports nothing, the string is untouched.
  await expect(page.locator("output")).toHaveText(
    "worker 42 | new Worker(new URL('./also-deleted.ts', import.meta.url))",
  );
});

test("a worker started inside a Vue component runs too", async ({ page }) => {
  const { default: vue } = await import("@vitejs/plugin-vue");
  await buildAndMount(
    page,
    {
      ...WORKER,
      "src/Counter.vue": `<template><p>{{ text }}</p></template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
const text = ref("waiting");
onMounted(() => {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<string>) => { text.value = e.data; };
  worker.postMessage(21);
});
</script>`,
      "src/view.ts": `import { createApp } from "vue";
import Counter from "./Counter.vue";
globalThis.__mountlyMcpView__ = { mount(c) { createApp(Counter).mount(c); }, unmount() {} };`,
    },
    [vue()],
  );
  await expect(page.locator("output")).toHaveText("worker 42");
});

test("a worker started inside a Svelte component runs too", async ({ page }) => {
  const { svelte } = await import("@sveltejs/vite-plugin-svelte");
  await buildAndMount(
    page,
    {
      ...WORKER,
      "src/Counter.svelte": `<script lang="ts">
  let text = $state("waiting");
  $effect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<string>) => { text = e.data; };
    worker.postMessage(21);
  });
</script>
<p>{text}</p>`,
      "src/view.ts": `import { mount } from "svelte";
import Counter from "./Counter.svelte";
globalThis.__mountlyMcpView__ = { mount(c) { mount(Counter, { target: c }); }, unmount() {} };`,
    },
    [svelte()],
  );
  await expect(page.locator("output")).toHaveText("worker 42");
});
