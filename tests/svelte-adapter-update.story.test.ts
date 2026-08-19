// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi } from "vite-plus/test";
import { createWidget } from "../packages/adapters/mountly-svelte/src/index";

describe("Svelte adapter update()", () => {
  it("patches props without remounting the component (Svelte 5)", async ({ task }) => {
    story.init(task);

    story.given("a Svelte 5 widget mounted with initial props via passed-in mount/unmount");

    const handle = { someExport: true };
    const svelteMountFn = vi.fn(() => handle);
    const svelteUnmountFn = vi.fn();
    const FakeComponent = () => {};

    const widget = createWidget(FakeComponent as any, {
      mount: svelteMountFn as any,
      unmount: svelteUnmountFn as any,
    });
    const container = document.createElement("div");

    await Promise.resolve(widget.mount(container, { label: "first" }));
    expect(svelteMountFn).toHaveBeenCalledTimes(1);

    story.when("update() is called with new props");
    await Promise.resolve(widget.update!(container, { label: "second" }));

    story.then("the component was NOT remounted — mount was only called once");
    expect(svelteMountFn).toHaveBeenCalledTimes(1);
    expect(svelteUnmountFn).not.toHaveBeenCalled();
  });
});
