export default {
  mount(container, props = {}) {
    container.innerHTML = `<span data-testid="pokemon-module">pokemon:${props.id ?? "none"}</span>`;
  },
  unmount(container) {
    container.innerHTML = "";
  },
};
