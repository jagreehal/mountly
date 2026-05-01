export default {
  mount(container, props = {}) {
    container.innerHTML = `<span data-testid="sports-card">sports:${props.team ?? "none"}</span>`;
  },
  unmount(container) {
    container.innerHTML = "";
  },
};
