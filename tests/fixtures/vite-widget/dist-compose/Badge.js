import { createElement } from "react";
//#region tests/fixtures/vite-widget/src/Badge.tsx
function Badge() {
	return createElement("span", { "data-testid": "badge" }, "badge");
}
//#endregion
export { Badge };
