import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../packages/mountly/src/bus";
import { createUrlState, parseQuery, serializeQuery } from "../packages/mountly/src/url-state";

describe("url state helpers", () => {
  it("parses repeated query params and serializes deterministic output", ({ task }) => {
    story.init(task);
    story.given("a query string with repeated keys");

    const parsed = parseQuery("?tab=stats&filter=open&filter=paid");

    story.when("it is serialized with a patch");
    const serialized = serializeQuery({
      ...parsed,
      page: 2,
      empty: null,
    });

    story.then("arrays and omitted nulls are handled predictably");
    expect(parsed).toEqual({ tab: "stats", filter: ["open", "paid"] });
    expect(serialized).toBe("filter=open&filter=paid&page=2&tab=stats");
  });

  it("applies conflict-safe patches against the latest query state", ({ task }) => {
    story.init(task);
    story.given("a memory-backed URL state helper");

    const url = createUrlState({
      url: "https://example.test/products?tab=details",
    });

    story.when("multiple callers patch different query keys");
    url.write({ color: "red" });
    url.write({ page: 2 });

    story.then("later writes preserve unrelated keys");
    expect(url.read()).toEqual({ tab: "details", color: "red", page: "2" });
    expect(url.toString()).toBe("color=red&page=2&tab=details");
  });
});

describe("createEventBus", () => {
  it("emits typed namespaced events and supports unsubscribe", ({ task }) => {
    story.init(task);
    story.given("a typed namespaced bus");

    const target = new EventTarget();
    const bus = createEventBus<{ changed: { id: string; count: number } }>({
      namespace: "cart",
      target,
    });
    const seen: Array<{ id: string; count: number }> = [];

    story.when("a listener is subscribed, called, then unsubscribed");
    const off = bus.on("changed", (payload) => seen.push(payload));
    bus.emit("changed", { id: "a", count: 1 });
    off();
    bus.emit("changed", { id: "b", count: 2 });

    story.then("only the subscribed event is observed");
    expect(bus.eventName("changed")).toBe("cart:changed");
    expect(seen).toEqual([{ id: "a", count: 1 }]);
  });

  it("can remove one subscription when a listener is reused for multiple events", ({ task }) => {
    story.init(task);
    story.given("one listener subscribed to two event names");

    const bus = createEventBus<{ one: number; two: number }>();
    const seen: number[] = [];
    const listener = (payload: number) => seen.push(payload);

    bus.on("one", listener);
    bus.on("two", listener);

    story.when("only one event subscription is removed");
    bus.off("one", listener);
    bus.emit("one", 1);
    bus.emit("two", 2);

    story.then("the other subscription remains active");
    expect(seen).toEqual([2]);
  });

  it("validates payloads when a validator is provided", ({ task }) => {
    story.init(task);
    story.given("a bus with a payload validator");

    const bus = createEventBus<{ selected: { id: string } }>({
      validators: {
        selected: (payload): payload is { id: string } =>
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { id?: unknown }).id === "string",
      },
    });

    story.when("an invalid payload is emitted");
    story.then("the bus throws an actionable error");
    expect(() => bus.emit("selected", { id: 1 } as never)).toThrow(
      'invalid payload for event "selected"',
    );
  });
});
