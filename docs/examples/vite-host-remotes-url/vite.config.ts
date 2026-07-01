import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { mountlyHostPlugin } from "mountly-vite-plugin";

// Federation-style remote declaration by URL. The host fetches the remote's published
// `mountly.manifest.fragment.json`, so it auto-discovers the remote's exposes, types, and
// entry — no local fragment file, no `shared` block. `import("demo-widget/Badge")` is native
// ESM resolved through the injected import map, and fully typed.
export default defineConfig({
  plugins: [
    react(),
    mountlyHostPlugin({
      remotes: {
        "demo-widget": process.env.MOUNTLY_REMOTE_URL ?? "http://localhost:5191/",
      },
    }),
  ],
  server: { port: 5192 },
});
