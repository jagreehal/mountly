import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mountlyMcpViews } from "mountly-mcp/vite";

export default defineConfig({
  plugins: [
    react(),
    mountlyMcpViews({
      apps: [
        {
          entry: "src/view.tsx",
          uri: "ui://deploys/board",
          name: "deploy_board",
          description: "Recent deploys and deploy logs",
          displayModes: ["inline", "fullscreen"],
          prefersBorder: true,
          awaitToolResult: true,
          // ChatGPT-only resource metadata; other hosts ignore it.
          openaiUi: {
            preferredDisplayMode: "inline",
            availableDisplayModes: ["inline", "fullscreen"],
          },
        },
      ],
    }),
  ],
});
