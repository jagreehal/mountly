// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { h, defineComponent, type Component } from "vue";
import { createWidget } from "../packages/adapters/mountly-vue/src/index";

describe("Vue adapter update()", () => {
  it("patches props without remounting the component", async ({ task }) => {
    story.init(task);

    story.given("a Vue widget mounted with initial props");

    let mountCount = 0;
    const TestComponent = defineComponent({
      props: { label: { type: String, default: "" } },
      setup(props) {
        mountCount++;
        return () => h("span", {}, props.label);
      },
    });

    const widget = createWidget(TestComponent as Component);
    const container = document.createElement("div");

    await Promise.resolve(widget.mount(container, { label: "first" }));
    expect(mountCount).toBe(1);

    story.when("update() is called with new props");
    await Promise.resolve(widget.update!(container, { label: "second" }));

    story.then("the component was NOT remounted");
    expect(mountCount).toBe(1);
  });
});
