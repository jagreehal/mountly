import { createWidget } from "mountly-react";
import React, { useState } from "react";

function sharedBadge(text, tone) {
  return React.createElement("span",
    { className: `badge badge-${tone}`, key: "badge" },
    text
  );
}

function Counter({ start = 0 }) {
  const [n, setN] = useState(start);
  return React.createElement("div", { className: "card" },
    sharedBadge("count", "primary"),
    React.createElement("strong", { className: "num" }, String(n)),
    React.createElement("button", {
      className: "inc",
      onClick: () => setN(c => c + 1)
    }, "+1")
  );
}

function Clock({ now }) {
  return React.createElement("div", { className: "card" },
    sharedBadge("clock", "info"),
    React.createElement("time", { className: "num" }, now ?? new Date().toLocaleTimeString())
  );
}

function Status({ message = "OK" }) {
  return React.createElement("div", { className: "card" },
    sharedBadge("status", "success"),
    React.createElement("p", { className: "msg" }, message)
  );
}

export const counter = createWidget(Counter, { shadow: true });
export const clock = createWidget(Clock, { shadow: true });
export const status = createWidget(Status, { shadow: true });
