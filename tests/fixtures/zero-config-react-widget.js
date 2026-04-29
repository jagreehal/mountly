import { createElement } from "https://esm.sh/react@18";
import { createWidget } from "/packages/adapters/mountly-react/dist/index.js";

const Hello = (props) =>
  createElement("span", { className: "styled-widget" }, props.msg ?? "");

export default createWidget(Hello);
