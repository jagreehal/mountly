// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { FRAME_READY, iframeModule } from "../packages/mountly/src/iframe";
import {
  clearPlaceholders,
  showPlaceholder,
} from "../packages/mountly/src/placeholder";

function signalReady(el: HTMLIFrameElement): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { "resize-iframe-message": FRAME_READY },
      source: el.contentWindow,
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("pre-activation placeholders", () => {
  it("shows host text until the frame reports ready", ({ task }) => {
    story.init(task);
    story.given("an iframe module with a text placeholder");
    const container = document.createElement("div");
    document.body.append(container);
    const mod = iframeModule("https://billing.example.com/widget", {
      title: "Billing",
      placeholder: "Loading billing…",
    });

    story.when("it mounts");
    mod.mount(container, {});
    const stub = container.querySelector("[data-mountly-placeholder]");
    expect(stub?.textContent).toBe("Loading billing…");
    expect(container.querySelector("iframe")).toBeTruthy();

    const el = container.querySelector("iframe") as HTMLIFrameElement;
    Object.defineProperty(el, "contentWindow", {
      value: { postMessage: vi.fn() },
      configurable: true,
    });

    story.when("the frame becomes ready");
    signalReady(el);

    story.then("the placeholder is gone and the iframe remains");
    expect(container.querySelector("[data-mountly-placeholder]")).toBeNull();
    expect(container.querySelector("iframe")).toBeTruthy();
    mod.unmount?.(container);
  });

  it("inserts text safely by default and html only when opted in", ({ task }) => {
    story.init(task);
    story.given("a container");
    const container = document.createElement("div");

    story.when("a string placeholder is shown without html:true");
    const clearText = showPlaceholder(container, "<b>nope</b>");
    expect(container.querySelector("[data-mountly-placeholder]")?.textContent).toBe("<b>nope</b>");
    clearText();

    story.when("trusted host markup opts into html");
    const clearHtml = showPlaceholder(container, "<em>skel</em>", { html: true });
    expect(container.querySelector("[data-mountly-placeholder]")?.innerHTML).toBe("<em>skel</em>");
    clearHtml();
    clearPlaceholders(container);
    expect(container.querySelector("[data-mountly-placeholder]")).toBeNull();
  });
});
