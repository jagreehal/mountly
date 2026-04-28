export default {
  mount(container, props) {
    container.innerHTML = `<span class="host-widget">${props?.msg ?? ''}</span>`;
  },
  unmount(container) { container.innerHTML = ''; }
};
