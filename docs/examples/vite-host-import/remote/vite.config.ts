import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { mountlyRemote } from "mountly-vite-plugin";

const root = dirname(fileURLToPath(import.meta.url));

// Drop-in remote: add the plugin, run `vite build`. No build script, no `shared` config.
export default defineConfig({
  root,
  plugins: [
    react(),
    mountlyRemote({
      name: "demo-widget",
      team: "demo",
      version: "0.0.1",
      featureExport: "demoWidget",
      exposes: {
        ".": "src/index.ts",
        "./Badge": "src/Badge.tsx",
      },
    }),
  ],
});
