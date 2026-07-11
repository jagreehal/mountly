import { useState } from "react";
//#region tests/fixtures/vite-widget/src/index.ts
var src_default = {
	mount(container) {
		useState(0);
		container.textContent = "widget";
	},
	unmount() {}
};
//#endregion
export { src_default as default };
