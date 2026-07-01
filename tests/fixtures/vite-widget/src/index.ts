import { useState } from "react";

export default {
  mount(container: HTMLElement) {
    useState(0);
    container.textContent = "widget";
  },
  unmount() {},
};
