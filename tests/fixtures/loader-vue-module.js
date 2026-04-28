import { h } from "https://esm.sh/vue@3";
import { createWidget } from "/packages/adapters/mountly-vue/dist/index.js";

const View = {
  props: ["msg"],
  render() {
    return h("span", { class: "vue-loader-widget" }, this.msg ?? "");
  },
};

export default createWidget(View, {
  styles: ".vue-loader-widget { color: rgb(66, 55, 44); border-top: 2px solid rgb(66, 55, 44); }",
});
