import { fileURLToPath } from "node:url";
import { defineElementsConfig } from "mountly-vite-plugin";

// One team, one independent build: its own embed.js and custom-elements.json.
export default defineElementsConfig({
  prefix: "support",
  elements: "src/*.tsx",
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Every team on the page shares one React through the host's import map.
  peer: true,
});
