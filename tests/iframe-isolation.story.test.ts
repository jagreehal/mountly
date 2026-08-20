// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi, afterEach } from "vite-plus/test";
import { FRAME_READY, iframeModule } from "../packages/mountly/src/iframe";
import { mountAsFrame } from "../packages/mountly/src/iframe-child";

const SRC = "https://billing.example.com/widget";

/** Unwrap resize-iframe's envelope so the assertions do not pin its wire format. */
function payload(message: unknown): unknown {
  return message && typeof message === "object" && "resize-iframe-message" in message
    ? (message as Record<string, unknown>)["resize-iframe-message"]
    : message;
}

/** Stand in for the framed page announcing that it is listening. */
function signalReady(el: HTMLIFrameElement): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { "resize-iframe-message": FRAME_READY },
      source: el.contentWindow,
    }),
  );
}

function host(): { container: HTMLElement; sent: () => unknown[]; frame: () => HTMLIFrameElement } {
  const container = document.createElement("div");
  document.body.append(container);
  const frame = () => container.querySelector("iframe") as HTMLIFrameElement;
  const posted: unknown[] = [];
  return {
    container,
    frame,
    sent: () => posted,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("cross-origin widgets keep their props but not their globals", () => {
  it("holds props until the framed page says it is listening", ({ task }) => {
    story.init(task);
    story.given("an iframe-backed feature module mounted into a host container");

    const { container, frame } = host();
    const mod = iframeModule(SRC, { title: "Billing breakdown", sandbox: "allow-scripts" });
    mod.mount(container, { tenantId: "acme" });

    const el = frame();
    const posted = vi.fn<(message: unknown, origin?: string) => void>();
    Object.defineProperty(el, "contentWindow", {
      value: { postMessage: posted },
      configurable: true,
    });

    story.then("no props are sent yet — the frame has not loaded");
    expect(posted).not.toHaveBeenCalled();

    story.when("the framed page completes the handshake");
    signalReady(el);

    story.then("the props cross the boundary, addressed to the widget's own origin");
    expect(posted).toHaveBeenCalledTimes(1);
    expect(payload(posted.mock.calls[0]?.[0])).toEqual({ tenantId: "acme" });
    expect(posted.mock.calls[0]?.[1]).toBe("https://billing.example.com");
  });

  it("sends the latest props when an update lands before the handshake", ({ task }) => {
    story.init(task);
    story.given("a mounted frame that has not finished loading");

    const { container, frame } = host();
    const mod = iframeModule(SRC, { title: "Billing breakdown" });
    mod.mount(container, { tenantId: "acme" });
    const el = frame();
    const posted = vi.fn<(message: unknown, origin?: string) => void>();
    Object.defineProperty(el, "contentWindow", {
      value: { postMessage: posted },
      configurable: true,
    });

    story.when("the host updates props, then the frame finishes loading");
    mod.update?.(container, { tenantId: "globex" });
    signalReady(el);

    story.then("only the newest props are delivered — the stale ones are never sent");
    expect(posted).toHaveBeenCalledTimes(1);
    expect(payload(posted.mock.calls[0]?.[0])).toEqual({ tenantId: "globex" });

    story.when("a further update arrives after the handshake");
    mod.update?.(container, { tenantId: "initech" });

    story.then("it goes straight across");
    expect(payload(posted.mock.calls[1]?.[0])).toEqual({ tenantId: "initech" });
  });

  it("prefetches the document once and cleans the listener up on unmount", ({ task }) => {
    story.init(task);
    story.given("a feature module for a widget that has not been mounted yet");

    const removeSpy = vi.spyOn(window, "removeEventListener");
    const mod = iframeModule("https://prefetch.example.com/widget", { title: "Prefetched" });

    story.then("the document is prefetched at load time, before any mount");
    const links = document.head.querySelectorAll('link[rel="prefetch"]');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("https://prefetch.example.com/widget");

    story.when("two containers mount and unmount the same module");
    const a = host();
    const b = host();
    mod.mount(a.container, {});
    mod.mount(b.container, {});
    expect(document.head.querySelectorAll('link[rel="prefetch"]')).toHaveLength(1);

    const elA = a.frame();
    mod.unmount?.(a.container);

    story.then("the frame is gone and its message listener is disconnected");
    expect(a.container.querySelector("iframe")).toBeNull();
    expect((elA as HTMLIFrameElement & { iframeResizer?: unknown }).iframeResizer).toBeUndefined();
    expect(removeSpy).toHaveBeenCalledWith("message", expect.any(Function));

    story.then("the other frame is untouched");
    expect(b.container.querySelector("iframe")).not.toBeNull();
    removeSpy.mockRestore();
  });
});

describe("the framed side mounts the same widget the host would have", () => {
  type Mounted = (container: Element, props: unknown) => void;

  const widget = () => ({
    mount: vi.fn<Mounted>(),
    update: vi.fn<Mounted>(),
    unmount: vi.fn<(container: Element) => void>(),
  });

  it("mounts on the host's props and updates on every later message", ({ task }) => {
    story.init(task);
    story.given("a framed page with resize-iframe's child script loaded");

    const sent: unknown[] = [];
    const parentIframe = {
      onMessage: null as ((message: unknown) => void) | null,
      sendMessage: (message: unknown) => sent.push(message),
    };
    Object.assign(globalThis, { parentIframe });

    story.when("the widget page calls mountAsFrame");
    const w = widget();
    const container = mountAsFrame(w);

    story.then("it announces itself and waits — nothing is mounted without props");
    expect(sent).toEqual([FRAME_READY]);
    expect(w.mount).not.toHaveBeenCalled();
    expect(container.hasAttribute("data-iframe-size")).toBe(true);

    story.when("the host answers with props, then updates them");
    parentIframe.onMessage?.({ tenantId: "acme" });
    parentIframe.onMessage?.({ tenantId: "globex" });

    story.then("the first message mounts and the second updates in place");
    expect(w.mount).toHaveBeenCalledTimes(1);
    expect(w.mount).toHaveBeenCalledWith(container, { tenantId: "acme" });
    expect(w.update).toHaveBeenCalledWith(container, { tenantId: "globex" });

    delete (globalThis as { parentIframe?: unknown }).parentIframe;
  });

  it("mounts standalone when the page is opened outside a frame", ({ task }) => {
    story.init(task);
    story.given("a widget page opened directly, with no embedder");

    delete (globalThis as { parentIframe?: unknown }).parentIframe;

    story.when("mountAsFrame runs");
    const w = widget();
    const container = mountAsFrame(w, { standaloneProps: { tenantId: "dev" } });

    story.then("it mounts anyway, so the page stays developable on its own");
    expect(w.mount).toHaveBeenCalledWith(container, { tenantId: "dev" });
  });

  it("fails loudly against a resize-iframe too old to deliver props", ({ task }) => {
    story.init(task);
    story.given("resize-iframe 0.1.x, whose child channel is send-only");

    Object.assign(globalThis, { parentIframe: { sendMessage: () => {} } });

    story.then("mountAsFrame refuses rather than hanging on props that never arrive");
    expect(() => mountAsFrame(widget())).toThrow(/resize-iframe 0\.2\.0/);

    delete (globalThis as { parentIframe?: unknown }).parentIframe;
  });
});
