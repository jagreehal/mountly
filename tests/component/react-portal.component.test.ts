import { afterEach, expect, test } from "vitest";
import { createElement } from "react";
import { createPortal } from "react-dom";
import { createWidget, usePortalContainer } from "../../packages/adapters/mountly-react/src/index";

afterEach(() => {
  document.body.replaceChildren();
});

/** Portals a popup the way Radix does: to the container, else document.body. */
function Popup() {
  const container = usePortalContainer();
  return createPortal(
    createElement("p", { className: "popup" }, "popup"),
    container ?? document.body,
  );
}

const find = (root: ParentNode) => root.querySelector(".popup");

test("portals into the shadow root, where the adopted stylesheet applies", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  await createWidget(Popup, { shadow: true, styles: ".popup { color: rgb(1, 2, 3); }" }).mount(
    host,
    {},
  );

  const shadow = host.querySelector("[data-mountly-root]")?.parentNode ?? host.shadowRoot!;
  await expect.poll(() => find(shadow)).not.toBeNull();
  expect(find(document.body)).toBeNull();
  expect(getComputedStyle(find(shadow)!).color).toBe("rgb(1, 2, 3)");
});

test("falls back to document.body in light DOM", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  await createWidget(Popup).mount(host, {});

  await expect.poll(() => document.body.querySelector(":scope > .popup")).not.toBeNull();
});
