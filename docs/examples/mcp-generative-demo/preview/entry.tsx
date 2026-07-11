import { createRoot } from "react-dom/client";
import { GeneratedUI } from "../src/registry.js";

// Browser preview of the generative render path: a json-render spec (injected
// as window.__SPEC__) rendered through the SAME registry the MCP widget uses.
// `onAction` stands in for the MCP host bridge — in the real widget this calls
// `App.sendMessage`; here it just logs so the click is visible.
const g = globalThis as {
  __SPEC__?: unknown;
  __STATE__?: Record<string, unknown>;
};
const spec = g.__SPEC__;
const state = g.__STATE__;
const log = document.getElementById("log");

createRoot(document.getElementById("app") as HTMLElement).render(
  <GeneratedUI
    spec={spec as never}
    state={state}
    onAction={(name, params) => {
      if (log) {
        log.textContent = `onAction → ${JSON.stringify({ action: name, params })}`;
        log.setAttribute("data-fired", "true");
      }
    }}
  />,
);
