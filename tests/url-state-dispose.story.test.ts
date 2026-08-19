// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi } from "vite-plus/test";
import { createUrlState } from "../packages/mountly/src/url-state";

describe("createUrlState dispose", () => {
  it("removes popstate and hashchange listeners on dispose", ({ task }) => {
    story.init(task);
    story.given("a url state created with browser listeners");

    const removeSpy = vi.spyOn(window, "removeEventListener");
    const state = createUrlState();

    story.when("dispose is called");
    state.dispose();

    story.then("popstate and hashchange listeners are removed");
    const removedEvents = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedEvents).toContain("popstate");
    expect(removedEvents).toContain("hashchange");

    removeSpy.mockRestore();
  });

  it("clears subscribers on dispose", ({ task }) => {
    story.init(task);
    story.given("a url state with one subscriber");

    const state = createUrlState({ url: "http://localhost/?a=1" });
    const listener = vi.fn();
    state.subscribe(listener);
    listener.mockClear();

    story.when("dispose is called and then write is called");
    state.dispose();
    state.write({ a: "2" });

    story.then("the subscriber is not notified");
    expect(listener).not.toHaveBeenCalled();
  });
});
