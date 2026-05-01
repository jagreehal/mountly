export default {
  mount(container, props = {}) {
    container.innerHTML = `<span data-testid="weather-card">weather:${props.city ?? "none"}</span>`;
  },
  unmount(container) {
    container.innerHTML = "";
  },
};
