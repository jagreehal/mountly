import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { mountlyMcpViews } from "mountly-mcp/vite";

export default defineConfig({
  plugins: [
    vue(),
    mountlyMcpViews({
      apps: [
        {
          entry: "src/view.ts",
          uri: "ui://mountly-examples/release-readiness",
          name: "release_readiness",
          description: "Review release signals and record a deployment decision",
          displayModes: ["inline", "fullscreen"],
          prefersBorder: false,
          awaitToolResult: true,
        },
      ],
    }),
  ],
});
