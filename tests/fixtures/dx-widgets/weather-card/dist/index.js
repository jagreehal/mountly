export default {
  mount(container, props = {}) {
    container.innerHTML = `<span data-testid="weather-card" data-module-url="${props.moduleUrl ?? ""}">weather:${props.city ?? "none"}</span>`;
  },
  unmount(container) {
    container.innerHTML = "";
  },
};
