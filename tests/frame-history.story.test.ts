// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createFrameChannel } from "../packages/mountly/src/frame-channel";
import {
  bindFrameHistory,
  bindFrameHistoryToRouter,
  HISTORY_NAVIGATE,
  HISTORY_SYNC,
  requestHostNavigation,
  type FrameHistoryEvents,
} from "../packages/mountly/src/frame-history";
import { createFeatureRouter } from "../packages/mountly/src/router";
import type { OnDemandFeature } from "../packages/mountly/src/feature";

function connectedPair() {
  let host: ReturnType<typeof createFrameChannel<FrameHistoryEvents>>;
  const frame = createFrameChannel<FrameHistoryEvents>((envelope) => host.receive(envelope));
  host = createFrameChannel<FrameHistoryEvents>((envelope) => frame.receive(envelope));
  return { host, frame };
}

function fakeFeature(id: string) {
  const unmount = vi.fn<() => void>();
  const mount = vi.fn(async () => ({ unmount }));
  const update = vi.fn(async () => {});
  return {
    feature: { id, mount, update } as unknown as OnDemandFeature,
    mount,
    update,
    unmount,
  };
}

describe("frame history protocol", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    document.body.replaceChildren();
  });

  it("lets the host be the only history writer when the frame navigates", ({ task }) => {
    story.init(task);
    story.given("a host bound to pushState navigation");
    const { host, frame } = connectedPair();
    const navigate = vi.fn<(url: string) => void>((url) => {
      window.history.pushState({}, "", url);
    });
    const stop = bindFrameHistory(host.channel, {
      navigate,
      syncOnBind: false,
      onHostUrlChange: () => () => {},
    });

    story.when("the frame requests /billing/2");
    requestHostNavigation(frame.channel, { url: "/billing/2" });

    story.then("the host performs it — the frame never touched history itself");
    expect(navigate).toHaveBeenCalledWith("/billing/2");
    expect(window.location.pathname).toBe("/billing/2");
    expect(HISTORY_NAVIGATE).toBe("history:navigate");
    stop();
  });

  it("honours replace semantics from the frame", ({ task }) => {
    story.init(task);
    story.given("separate push and replace handlers");
    const { host, frame } = connectedPair();
    const navigate = vi.fn();
    const replace = vi.fn();
    const stop = bindFrameHistory(host.channel, {
      navigate,
      replace,
      syncOnBind: false,
      onHostUrlChange: () => () => {},
    });

    story.when("the frame asks for replace");
    requestHostNavigation(frame.channel, { url: "/billing/3", history: "replace" });

    story.then("only replace runs");
    expect(replace).toHaveBeenCalledWith("/billing/3");
    expect(navigate).not.toHaveBeenCalled();
    stop();
  });

  it("fans host URL changes back into the frame as history:sync", ({ task }) => {
    story.init(task);
    story.given("a frame listening for sync");
    const { host, frame } = connectedPair();
    const synced = vi.fn();
    frame.channel.on(HISTORY_SYNC, synced);
    let notify: (() => void) | undefined;
    const stop = bindFrameHistory(host.channel, {
      navigate: (url) => window.history.pushState({}, "", url),
      onHostUrlChange: (listener) => {
        notify = listener;
        return () => {
          notify = undefined;
        };
      },
      syncOnBind: true,
    });

    story.then("an initial sync is emitted on bind");
    expect(synced).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/", rest: "", query: {} }),
    );

    story.when("the host URL changes");
    window.history.pushState({}, "", "/settings/profile?tab=security");
    notify?.();

    story.then("the frame receives pathname, rest-ready fields, and parsed query");
    expect(synced).toHaveBeenLastCalledWith({
      pathname: "/settings/profile",
      search: "?tab=security",
      hash: "",
      rest: "",
      query: { tab: "security" },
    });
    expect(HISTORY_SYNC).toBe("history:sync");
    stop();
  });

  it("wires a FeatureRouter as the sole writer", async ({ task }) => {
    story.init(task);
    story.given("a router and a framed billing feature");
    const container = document.createElement("div");
    const billing = fakeFeature("billing");
    window.history.replaceState({}, "", "/billing/1");
    const router = createFeatureRouter({
      container,
      routes: [{ path: "/billing/*", feature: billing.feature }],
    });
    router.start();
    await vi.waitFor(() => expect(billing.mount).toHaveBeenCalled());

    const { host, frame } = connectedPair();
    const stop = bindFrameHistoryToRouter(host.channel, router, {
      syncOnBind: false,
      onHostUrlChange: () => () => {},
    });

    story.when("the frame asks the host to navigate within its segment");
    requestHostNavigation(frame.channel, { url: "/billing/9" });
    await vi.waitFor(() => expect(billing.update).toHaveBeenCalled());

    story.then("the router updates rather than remounting");
    expect(window.location.pathname).toBe("/billing/9");
    expect(billing.mount).toHaveBeenCalledTimes(1);
    stop();
    router.stop();
  });
});
