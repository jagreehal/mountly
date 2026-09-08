import { afterEach, expect, test } from "vitest";
import { createWidget } from "../../packages/adapters/mountly-svelte/src/index";
import Counter from "./fixtures/Counter.svelte";

let host: HTMLElement;
afterEach(() => host?.remove());

const mountCounter = async (balance: number) => {
  host = document.createElement("div");
  document.body.append(host);
  const widget = createWidget(Counter as never);
  await widget.mount(host, { balance });
  return widget;
};

const shown = () => host.querySelector("[data-testid=balance]")?.textContent;

test("a prop update re-renders without discarding component state", async () => {
  const widget = await mountCounter(7);
  expect(shown()).toBe("7");

  // Give the component some internal state to lose.
  host.querySelector("button")!.click();
  await new Promise((r) => setTimeout(r, 0));
  expect(host.querySelector("button")!.textContent).toContain("clicked 1");

  await widget.update?.(host, { balance: 9 });
  await new Promise((r) => setTimeout(r, 0));

  expect(shown()).toBe("9");
  expect(host.querySelector("button")!.textContent).toContain("clicked 1");
});
