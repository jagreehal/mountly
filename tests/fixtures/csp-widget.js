// A framework-free widget: a WidgetModule is just mount/update/unmount.
export default {
  mount(container, props) {
    container.textContent = String(props?.label ?? "mounted");
  },
  unmount(container) {
    container.textContent = "";
  },
};
