import { expect, test, vi } from "vitest";
import { App, runBridge } from "../../packages/mcp-apps/src/bridge/index";
import { createMcpWidget as createVueWidget } from "../../packages/mcp-apps/src/vue/index";
import { createMcpWidget as createSvelteWidget } from "../../packages/mcp-apps/src/svelte/index";
import type { AdapterOptions } from "mountly/adapter";
import VueQuote from "./fixtures/Quote.vue";
import SvelteQuote from "./fixtures/Quote.svelte";

/**
 * COMPONENT TIER — rendering claims for the framework entry points.
 *
 * Two things put these here rather than in the jsdom tier:
 *
 * 1. Single-file components need their compiler. `.svelte` and `.vue` are only
 *    testable at all inside a Vite pipeline, which is what makes the Svelte
 *    entry point provable instead of merely typed.
 * 2. "The styles actually applied" is a claim about a CSS engine.
 *    `getComputedStyle` in jsdom does not resolve stylesheet rules the way a
 *    browser does, so asserting it there proves less than production.
 *
 * Claims that are pure logic — which notifications the bridge acts on, whether
 * a display mode gets requested — stay in the jsdom tier, which runs in
 * milliseconds. Nothing is proved twice.
 */

async function mountWidget(
  widget: Parameters<typeof runBridge>[0]["widget"],
): Promise<{ app: App; container: HTMLElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const bridge = runBridge({
    app: new App({ name: "component-test", version: "0" }),
    widget,
    container,
  });
  await bridge.ready;

  emitToolResult(bridge.app, { structuredContent: { total: 99, currency: "USD" } });
  return { app: bridge.app, container };
}

function emitToolResult(app: App, params: unknown): void {
  const handlers = (
    app as unknown as {
      _notificationHandlers: Map<
        string,
        (notification: { method: string; params: unknown }) => void
      >;
    }
  )._notificationHandlers;
  handlers.get("ui/notifications/tool-result")?.({
    method: "ui/notifications/tool-result",
    params,
  });
}

/** Widgets mount into the light DOM unless a widget opts into `shadow: true`. */
function quote(root: ParentNode): HTMLElement | null {
  return root.querySelector("[data-testid='quote']");
}

function total(root: ParentNode): string {
  return root.querySelector("[data-testid='total']")?.textContent?.trim() ?? "";
}

test("a Vue widget renders tool-result, with its stylesheet really applied", async () => {
  const { container } = await mountWidget(createVueWidget(VueQuote));

  await vi.waitFor(() => expect(total(container)).toContain("99"));
  expect(total(container)).toContain("USD");

  const section = quote(container) as HTMLElement;
  expect(getComputedStyle(section).color).toBe("rgb(0, 128, 0)");
});

test("a second tool-result updates the same instance rather than remounting", async () => {
  const { app, container } = await mountWidget(createVueWidget(VueQuote));
  await vi.waitFor(() => expect(total(container)).toContain("99"));

  emitToolResult(app, { structuredContent: { total: 12, currency: "GBP" } });

  await vi.waitFor(() => expect(total(container)).toContain("12"));
  expect(container.querySelectorAll("[data-testid='quote']").length).toBe(1);
});

test("a Svelte widget renders tool-result from props, with its stylesheet really applied", async () => {
  const { container } = await mountWidget(createSvelteWidget(SvelteQuote));

  await vi.waitFor(() => expect(total(container)).toContain("99"));
  expect(total(container)).toContain("USD");

  const section = quote(container) as HTMLElement;
  expect(getComputedStyle(section).color).toBe("rgb(0, 0, 255)");
});

// Host-context propagation is NOT tested here. The bridge reads it from
// `app.getHostContext()`, which only the transport populates, so calling the
// handler by hand would assert against a context that is permanently empty —
// green, and meaningless. The journey tier drives a real host and owns it.

test("shadow: true isolates the widget from page styles", async () => {
  const leak = document.createElement("style");
  leak.textContent = "[data-testid='quote'] { color: rgb(255, 0, 0); }";
  document.head.appendChild(leak);

  const options: AdapterOptions = {
    shadow: true,
    styles: "[data-testid='quote'] { color: rgb(0, 128, 0); }",
  };
  const { container } = await mountWidget(createVueWidget(VueQuote, options));

  await vi.waitFor(() => expect(container.shadowRoot).not.toBeNull());
  const shadow = container.shadowRoot as ShadowRoot;
  await vi.waitFor(() => expect(total(shadow)).toContain("99"));

  // The page's rule does not cross the boundary; the widget's own does.
  expect(getComputedStyle(quote(shadow) as HTMLElement).color).toBe("rgb(0, 128, 0)");

  leak.remove();
});
