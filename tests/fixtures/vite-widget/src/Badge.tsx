import { createElement } from "react";

export function Badge() {
  return createElement("span", { "data-testid": "badge" }, "badge");
}
