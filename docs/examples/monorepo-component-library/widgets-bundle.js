import React, { useState } from "react";
import { createWidget } from "mountly-react";
import { Button, Card, Chip } from "./ui-lib.js";

function CounterWidget({ start = 0 }) {
  const [n, setN] = useState(start);
  return React.createElement(Card, { title: "Counter" },
    React.createElement(Chip, null, "live"),
    React.createElement("p", { className: "ui-num", "data-testid": "counter-value" }, n),
    React.createElement("div", { className: "ui-row" },
      React.createElement(Button, { variant: "default", onClick: () => setN(x => x - 1) }, "−"),
      React.createElement(Button, { variant: "primary", onClick: () => setN(x => x + 1) }, "+"),
    ),
  );
}

function StatusWidget({ message = "OK" }) {
  return React.createElement(Card, { title: "Status" },
    React.createElement(Chip, null, "healthy"),
    React.createElement("p", { className: "ui-msg" }, message),
  );
}

function PricingWidget({ plan = "Pro", price = 29 }) {
  return React.createElement(Card, { title: "Pricing" },
    React.createElement(Chip, null, plan),
    React.createElement("p", { className: "ui-amount" }, `$${price}/mo`),
    React.createElement(Button, { variant: "primary" }, "Subscribe"),
  );
}

export const counter = createWidget(CounterWidget, { shadow: true });
export const status = createWidget(StatusWidget, { shadow: true });
export const pricing = createWidget(PricingWidget, { shadow: true });
