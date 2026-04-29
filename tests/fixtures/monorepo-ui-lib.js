// Stand-in for `@org/ui` — a workspace package that other packages import.
// Uses a real third-party npm dep (clsx) to prove transitive npm imports
// survive the monorepo + mountly pipeline.
import { createElement as h } from "https://esm.sh/react@19.2.5";
import clsx from "https://esm.sh/clsx@2.1.1";

export const Button = ({ variant = "default", className, children, ...rest }) =>
  h("button", { className: clsx("ui-btn", `ui-btn-${variant}`, className), ...rest }, children);

export const Card = ({ tone = "neutral", title, children }) =>
  h(
    "section",
    { className: clsx("ui-card", `ui-card-${tone}`) },
    h("header", { className: "ui-card-header" }, title),
    h("div", { className: "ui-card-body" }, children),
  );

export const Chip = ({ children }) =>
  h("span", { className: "ui-chip" }, children);

// In a real monorepo this is a regular package.json export — same shape.
export const __ui_lib_marker = "monorepo-ui-lib@simulated";
