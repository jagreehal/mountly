// Simulates a user's pre-built Vue widget bundle.
import { h } from "https://esm.sh/vue@3";
import { createWidget } from "/packages/adapters/mountly-vue/dist/index.js";

const Hello = {
  props: ["msg"],
  render() { return h("span", { class: "styled-widget" }, this.msg ?? ""); },
};

export default createWidget(Hello);
