import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { mountlyHostPlugin } from "mountly-vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    mountlyHostPlugin({
      verticals: [{ fragment: "./remote/dist/mountly.manifest.fragment.json" }],
    }),
  ],
  server: {
    port: 5190,
    proxy: {
      "/docs/examples": "http://localhost:5182",
    },
  },
});
