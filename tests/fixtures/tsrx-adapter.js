import { createWidget } from "/packages/adapters/mountly-tsrx/dist/index.js";

const renderHost = document.getElementById("render");
const lifecycleHost = document.getElementById("lifecycle");

let renderUpdates = 0;
const renderWidget = createWidget({
  render(target, props) {
    const root = document.createElement("div");
    root.className = "tsrx-rendered";
    root.setAttribute("data-mountly-root", "");
    root.textContent = props?.text ?? "";
    target.appendChild(root);

    return {
      update(nextProps) {
        renderUpdates += 1;
        root.textContent = nextProps?.text ?? "";
      },
      destroy() {
        root.remove();
      },
    };
  },
}, { cssUrl: "/tests/fixtures/tsrx-adapter.css" });

let lifecycleMounts = 0;
let lifecycleUnmounts = 0;
const lifecycleWidget = createWidget({
  mount(target, props) {
    lifecycleMounts += 1;
    const root = document.createElement("div");
    root.setAttribute("data-mountly-root", "");
    root.textContent = props?.text ?? "";
    target.appendChild(root);
  },
  unmount(target) {
    lifecycleUnmounts += 1;
    target.textContent = "";
  },
});

await renderWidget.mount(renderHost, { text: "render-a" });
renderWidget.update(renderHost, { text: "render-b" });

lifecycleWidget.mount(lifecycleHost, { text: "life-a" });
lifecycleWidget.update(lifecycleHost, { text: "life-b" });

window.__result = {
  renderText: renderHost.shadowRoot?.textContent ?? "",
  renderColor: getComputedStyle(renderHost.shadowRoot.querySelector(".tsrx-rendered")).color,
  lifecycleText: lifecycleHost.shadowRoot?.textContent ?? "",
  renderUpdates,
  lifecycleMounts,
  lifecycleUnmounts,
};
