import { createElement } from "https://esm.sh/react@18";
import { createWidget } from "/packages/adapters/mountly-react/dist/index.js";

const View = (props) => createElement("span", { className: "react-loader-widget" }, props.msg ?? "");
export default createWidget(View, {
  shadow: false,
  styles: ".react-loader-widget { color: rgb(12, 34, 56); border-top: 2px solid rgb(12, 34, 56); }",
});
