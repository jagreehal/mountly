import React from "react";

export function Button({ variant = "default", className, children, ...rest }) {
  return React.createElement("button",
    { className: ["ui-btn", `ui-btn-${variant}`, className].filter(Boolean).join(" "), ...rest },
    children
  );
}

export function Card({ title, children }) {
  return React.createElement("section", { className: "ui-card" },
    React.createElement("header", { className: "ui-card-header" }, title),
    React.createElement("div", { className: "ui-card-body" }, children),
  );
}

export function Chip({ children }) {
  return React.createElement("span", { className: "ui-chip" }, children);
}
