import { mergeConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import { defineMountlyWidgetConfig } from "mountly-vite-plugin";

export default defineMountlyWidgetConfig({ framework: "react" }).map((config) =>
  mergeConfig(config, { plugins: [react()] }),
);
