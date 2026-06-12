// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createWidget } from "mountly-react";
import { GeneratedUI } from "./registry.js";
import { SAMPLE_SPECS } from "../demo-core.mjs";
import geminiSpec from "../fixtures/gemini-generated-spec.json";

// Tell React this is an act()-aware environment (silences the test warning).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/**
 * Native (non-MCP) path: the SAME catalog + registry + renderer mounts as an
 * ordinary mountly widget, with no MCP host involved. Proves the generative
 * layer isn't coupled to the MCP bridge — it's just a mountly WidgetModule.
 */
describe("native generative render", () => {
  it("mounts a json-render spec into a container as real DOM", async () => {
    const widget = createWidget(GeneratedUI);
    const el = document.createElement("div");
    document.body.appendChild(el);

    await widget.mount(el, { spec: SAMPLE_SPECS.revenue });
    // React commits asynchronously under createRoot — flush macrotasks.
    await new Promise((r) => setTimeout(r, 0));

    const text = el.textContent ?? el.shadowRoot?.textContent ?? "";
    expect(text).toContain("Revenue dashboard");
    expect(text).toContain("Total revenue");
    expect(text).toContain("$48,200");

    await widget.unmount(el);
    el.remove();
  });

  // The differentiator: a generated UI's action reaches the agent. json-render
  // resolves the button's `on.click` binding and fires `onAction`; the widget
  // routes that to `App.sendMessage`. Here we assert the json-render half of
  // the bridge (the MCP half is `mcp.sendMessage` in widget.tsx).
  it("a generated button's action fires onAction with its params", async () => {
    const seen: Array<[string, unknown]> = [];
    const spec = {
      root: "b",
      elements: {
        b: {
          type: "Button",
          props: { label: "Ask" },
          children: [],
          on: { click: { action: "ask", params: { prompt: "Show Q3" } } },
        },
      },
    };

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <GeneratedUI
          spec={spec as never}
          onAction={(name, params) => seen.push([name, params])}
        />,
      );
    });

    const btn = host.querySelector("button");
    expect(btn).not.toBeNull();
    await act(async () => {
      btn?.click();
    });

    expect(seen).toEqual([["ask", { prompt: "Show Q3" }]]);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  // Closes the seam: a REAL model-generated spec (Gemini) renders end-to-end —
  // its Metric values are `$state` bindings resolved from the spec's `state`
  // block, and its `on.press` button reaches the agent. This is the full
  // prompt→spec→render→action loop on actual model output, not a sample.
  it("renders a real generated spec: $state values resolve + press action fires", async () => {
    const state = (geminiSpec as { state?: Record<string, unknown> }).state;
    const seen: Array<[string, unknown]> = [];

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <GeneratedUI
          spec={geminiSpec as never}
          state={state}
          onAction={(name, params) => seen.push([name, params])}
        />,
      );
    });

    // $state-bound metric values resolved from spec.state (not "[object Object]"):
    const text = host.textContent ?? "";
    expect(text).toContain("$1,234,567");
    expect(text).toContain("12.5%");
    expect(text).toContain("8,765");

    // the model's `on.press` button bridges to the agent (dual-emit Button):
    await act(async () => {
      host.querySelector("button")?.click();
    });
    expect(seen[0]?.[0]).toBe("ask");
    expect((seen[0]?.[1] as { prompt?: string })?.prompt).toMatch(/Q3/);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
