import { story } from "executable-stories-vitest";
import { describe, expect, it, vi } from "vite-plus/test";
import { createFrameChannel, FRAME_CONTRACT_VERSION } from "../packages/mountly/src/frame-channel";

// An `interface`, not a `type`: the natural way to declare a contract, and
// the shape the generic constraint must keep accepting.
interface Events {
  productSelected: { productId: string };
  userChanged: { id: string };
}

/** Wire two channels back to back, the way a host and its frame sit. */
function connectedPair(
  hostOptions: Parameters<typeof createFrameChannel<Events>>[1] = {},
  frameOptions: Parameters<typeof createFrameChannel<Events>>[1] = {},
) {
  let host: ReturnType<typeof createFrameChannel<Events>>;
  const frame = createFrameChannel<Events>((envelope) => host.receive(envelope), frameOptions);
  host = createFrameChannel<Events>((envelope) => frame.receive(envelope), hostOptions);
  return { host, frame };
}

describe("frame channel", () => {
  it("carries typed events in both directions across the boundary", ({ task }) => {
    story.init(task);
    story.given("a host and a framed widget sharing a contract");
    const { host, frame } = connectedPair();

    const seenByHost = vi.fn<(p: Events["productSelected"]) => void>();
    const seenByFrame = vi.fn<(p: Events["userChanged"]) => void>();
    host.channel.on("productSelected", seenByHost);
    frame.channel.on("userChanged", seenByFrame);

    story.when("each side emits an event the other listens for");
    frame.channel.emit("productSelected", { productId: "p-1" });
    host.channel.emit("userChanged", { id: "u-9" });

    story.then("both arrive with their payloads intact — the gap iframes normally leave");
    expect(seenByHost).toHaveBeenCalledWith({ productId: "p-1" });
    expect(seenByFrame).toHaveBeenCalledWith({ id: "u-9" });
  });

  it("drops events from a peer speaking a newer contract instead of crashing", ({ task }) => {
    story.init(task);
    story.given("a v1 host and a widget redeployed speaking v2");
    const onDrop = vi.fn<(reason: string) => void>();
    const { host, frame } = connectedPair({ version: 1, onDrop }, { version: 2 });

    const seenByHost = vi.fn<(p: Events["productSelected"]) => void>();
    host.channel.on("productSelected", seenByHost);

    story.when("the newer widget emits");
    frame.channel.emit("productSelected", { productId: "p-2" });

    story.then("the old host ignores it and says why, rather than throwing");
    expect(seenByHost).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledWith(expect.stringContaining("v2"));
  });

  it("delivers events from a peer speaking an older contract", ({ task }) => {
    story.init(task);
    story.given("a v2 host and a widget still on v1");
    const { host, frame } = connectedPair({ version: 2 }, { version: 1 });
    const seenByHost = vi.fn<(p: Events["productSelected"]) => void>();
    host.channel.on("productSelected", seenByHost);

    story.when("the older widget emits");
    frame.channel.emit("productSelected", { productId: "p-3" });

    story.then("the newer host still understands what it used to send");
    expect(seenByHost).toHaveBeenCalledWith({ productId: "p-3" });
  });

  it("never trusts the frame: an invalid payload is dropped, not delivered", ({ task }) => {
    story.init(task);
    story.given("a host validating productSelected payloads");
    const onDrop = vi.fn<(reason: string) => void>();
    const { host, frame } = connectedPair({
      onDrop,
      validators: {
        productSelected: (p): p is Events["productSelected"] =>
          typeof (p as { productId?: unknown })?.productId === "string",
      },
    });
    const seenByHost = vi.fn<(p: Events["productSelected"]) => void>();
    host.channel.on("productSelected", seenByHost);

    story.when("a compromised or buggy frame sends the wrong shape");
    // Bypasses the frame's own emit-side guard, as a hostile frame would.
    host.receive({
      __mountlyFrame: FRAME_CONTRACT_VERSION,
      name: "productSelected",
      payload: { productId: 42 },
    });

    story.then("the host drops it — validation is enforced on receive, not just on send");
    expect(seenByHost).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledWith(expect.stringContaining("validation"));
    expect(frame).toBeDefined();
  });

  it("rejects an invalid payload at the sender, before it crosses", ({ task }) => {
    story.init(task);
    story.given("a frame whose emit is guarded by the same validator");
    const { frame } = connectedPair(
      {},
      {
        validators: {
          userChanged: (p): p is Events["userChanged"] =>
            typeof (p as { id?: unknown })?.id === "string",
        },
      },
    );

    story.when("it emits the wrong shape");
    story.then("the mistake surfaces at the call site, not silently on the far side");
    expect(() => frame.channel.emit("userChanged", { id: 7 as unknown as string })).toThrow(
      /invalid payload/,
    );
  });

  it("ignores non-channel traffic so props still reach the widget", ({ task }) => {
    story.init(task);
    story.given("a channel sharing one transport with the host's prop messages");
    const { host } = connectedPair();

    story.when("a plain props object arrives");
    const consumed = host.receive({ plan: "annual" });

    story.then("it is not consumed, so the caller can treat it as props");
    expect(consumed).toBe(false);
  });

  it("stops delivering after unsubscribe, mid-dispatch included", ({ task }) => {
    story.init(task);
    story.given("two listeners where the first removes the second");
    const { host, frame } = connectedPair();
    const second = vi.fn<(p: Events["productSelected"]) => void>();
    const off2 = host.channel.on("productSelected", second);
    host.channel.on("productSelected", () => off2());

    story.when("an event is dispatched twice");
    frame.channel.emit("productSelected", { productId: "a" });
    frame.channel.emit("productSelected", { productId: "b" });

    story.then("the removal takes effect without disturbing the in-flight dispatch");
    expect(second).toHaveBeenCalledTimes(1);
  });
});
