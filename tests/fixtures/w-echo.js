// Plain widget module: the whole contract is mount/unmount. Its sibling
// w-echo.css is auto-loaded by the core from this file's URL.
window.__loaded = (window.__loaded ?? 0) + 1;

export default {
  mount(el, props) {
    window.__mounts = (window.__mounts ?? 0) + 1;
    const span = document.createElement("span");
    span.className = "island-msg";
    span.textContent = String(props?.msg ?? "mounted");
    el.replaceChildren(span);
  },
  update(el, props) {
    el.querySelector(".island-msg").textContent = String(props?.msg ?? "");
  },
  unmount(el) {
    el.replaceChildren();
  },
};
