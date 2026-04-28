import reactWidget from "./react-widget";
import vueWidget from "./vue-widget";
import svelteWidget from "./svelte-widget";

function mountAll(): void {
  const reactRoot = document.getElementById("react-root");
  const vueRoot = document.getElementById("vue-root");
  const svelteRoot = document.getElementById("svelte-root");
  if (!reactRoot || !vueRoot || !svelteRoot) return;
  reactWidget.mount(reactRoot, {});
  vueWidget.mount(vueRoot, {});
  svelteWidget.mount(svelteRoot, {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountAll, { once: true });
} else {
  mountAll();
}
