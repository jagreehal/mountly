// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  bindFrameOverlay,
  closeHostOverlay,
  openHostOverlay,
  OVERLAY_CLOSED,
  OVERLAY_CLOSE,
  OVERLAY_OPEN,
} from "../packages/mountly/src/frame-overlay";
import { createFrameChannel } from "../packages/mountly/src/frame-channel";
import type { FrameOverlayEvents } from "../packages/mountly/src/frame-overlay";

function connectedPair() {
  let host: ReturnType<typeof createFrameChannel<FrameOverlayEvents>>;
  const frame = createFrameChannel<FrameOverlayEvents>((envelope) => host.receive(envelope));
  host = createFrameChannel<FrameOverlayEvents>((envelope) => frame.receive(envelope));
  return { host, frame };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("frame overlay breakout", () => {
  it("renders a named slot in the host document when the frame asks", ({ task }) => {
    story.init(task);
    story.given("a host that maps the checkout-modal slot to a button");
    const { host, frame } = connectedPair();
    const renderSlot = vi.fn(
      ({ container, props }: { container: HTMLElement; props: Record<string, unknown> }) => {
        container.textContent = `plan:${String(props.plan)}`;
      },
    );
    const stop = bindFrameOverlay(host.channel, { renderSlot });

    story.when("the frame opens an overlay by slot name");
    openHostOverlay(frame.channel, {
      id: "checkout",
      slot: "checkout-modal",
      props: { plan: "pro" },
    });

    story.then("the host owns the dialog in the top document — not clipped by the iframe");
    const overlay = document.querySelector('[data-mountly-overlay-id="checkout"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.getAttribute("role")).toBe("dialog");
    expect(overlay?.textContent).toBe("plan:pro");
    expect(renderSlot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "checkout", slot: "checkout-modal" }),
    );
    stop();
  });

  it("refuses raw html unless the host supplies sanitizeHtml", ({ task }) => {
    story.init(task);
    story.given("a host with no sanitizer");
    const { host, frame } = connectedPair();
    const onRefuse = vi.fn();
    const stop = bindFrameOverlay(host.channel, { onRefuse });

    story.when("the frame tries to inject html");
    openHostOverlay(frame.channel, {
      id: "xss",
      html: "<img src=x onerror=alert(1)>",
    });

    story.then("nothing is inserted — a frame you isolated is a frame whose markup you do not trust");
    expect(document.querySelector("[data-mountly-overlay-id]")).toBeNull();
    expect(onRefuse).toHaveBeenCalledWith(
      expect.stringContaining("sanitizeHtml"),
      expect.objectContaining({ id: "xss" }),
    );
    stop();
  });

  it("inserts sanitized html when the host opts in", ({ task }) => {
    story.init(task);
    story.given("a host that strips tags");
    const { host, frame } = connectedPair();
    const stop = bindFrameOverlay(host.channel, {
      sanitizeHtml: (html) => html.replace(/<[^>]+>/g, ""),
    });

    story.when("the frame opens an html overlay");
    openHostOverlay(frame.channel, { id: "note", html: "<b>hello</b>" });

    story.then("only the sanitized text reaches the document");
    expect(document.querySelector('[data-mountly-overlay-id="note"]')?.textContent).toBe("hello");
    stop();
  });

  it("closes on request and notifies the frame", ({ task }) => {
    story.init(task);
    story.given("an open overlay");
    const { host, frame } = connectedPair();
    const closed = vi.fn();
    frame.channel.on(OVERLAY_CLOSED, closed);
    const stop = bindFrameOverlay(host.channel, {
      renderSlot: ({ container }) => {
        container.textContent = "open";
      },
    });
    openHostOverlay(frame.channel, { id: "m", slot: "modal" });
    expect(document.querySelector('[data-mountly-overlay-id="m"]')).toBeTruthy();

    story.when("the frame asks to close it");
    closeHostOverlay(frame.channel, "m");

    story.then("the host removes it and emits overlay:closed back");
    expect(document.querySelector('[data-mountly-overlay-id="m"]')).toBeNull();
    expect(closed).toHaveBeenCalledWith({ id: "m" });
    expect(OVERLAY_OPEN).toBe("overlay:open");
    expect(OVERLAY_CLOSE).toBe("overlay:close");
    stop();
  });

  it("tears every overlay down when the binder is stopped", ({ task }) => {
    story.init(task);
    story.given("two open overlays");
    const { host, frame } = connectedPair();
    const stop = bindFrameOverlay(host.channel, {
      renderSlot: ({ container, id }) => {
        container.textContent = id;
      },
    });
    openHostOverlay(frame.channel, { id: "a", slot: "x" });
    openHostOverlay(frame.channel, { id: "b", slot: "y" });

    story.when("the frame unmounts and the host runs cleanup");
    stop();

    story.then("no overlay nodes remain");
    expect(document.querySelectorAll("[data-mountly-overlay-id]")).toHaveLength(0);
  });
});
