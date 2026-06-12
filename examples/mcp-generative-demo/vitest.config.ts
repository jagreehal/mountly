import { defineConfig } from "vitest/config";

// Local config so this example's tests aren't governed by the repo-root
// `include: tests/**/*.story.test.ts`. Picks up the colocated `src/*.test.tsx`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
  },
});
