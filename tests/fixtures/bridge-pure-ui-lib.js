// `@my-org/ui` — a generic React UI library. Knows nothing about mountly.
// This file would equally work in a Next.js app, a TanStack Start app, a
// Vite SPA, or anywhere else React renders. It uses real npm primitives:
// clsx for className merging and @radix-ui/react-slot for the shadcn-style
// `asChild` pattern.
import { createElement as h } from "https://esm.sh/react@19.2.5";
import clsx from "https://esm.sh/clsx@2.1.1";
import { Slot } from "https://esm.sh/@radix-ui/react-slot@1.1.2?deps=react@19.2.5";

export const Button = ({
  variant = "default",
  asChild = false,
  className,
  children,
  ...rest
}) => {
  // shadcn-style: when `asChild` is true, the child element receives the
  // button's classes and event handlers. Used for `<Button asChild><a href>`.
  const Comp = asChild ? Slot : "button";
  return h(
    Comp,
    { className: clsx("ui-btn", `ui-btn-${variant}`, className), ...rest },
    children,
  );
};

export const Card = ({ tone = "neutral", title, children }) =>
  h(
    "section",
    { className: clsx("ui-card", `ui-card-${tone}`) },
    title && h("h3", { className: "ui-card-title" }, title),
    h("div", { className: "ui-card-body" }, children),
  );

export const Stack = ({ gap = 8, children }) =>
  h(
    "div",
    { className: "ui-stack", style: { display: "flex", flexDirection: "column", gap } },
    children,
  );

// Marker so the bridge test can confirm this same library file was
// consumed without bridge involvement.
export const __ui_id = "pure-react-ui-lib@1.0.0";
