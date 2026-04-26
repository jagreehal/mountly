import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["mountly"],
  },
  server: {
    port: 5178,
    strictPort: true,
  },
});
