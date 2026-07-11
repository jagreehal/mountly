import { createRequire } from "node:module";
import type { Reporter } from "vite-plus/test/node";
import { defineConfig } from "vite-plus";

const require = createRequire(import.meta.url);
const { StoryReporter } = require("executable-stories-vitest/reporter");

export default defineConfig({
  lint: {
    ignorePatterns: [
      "**/dist/**",
      "**/dist-*/**",
      "**/node_modules/**",
      "docs/.astro/**",
      "docs/dist/**",
      "tests/fixtures/**/*.js",
      "tests/fixtures/**/*.css",
      "tests/fixtures/**/vite.config.ts",
      "docs/examples/**/preview/**",
      "docs/examples/**/preview-host/**",
      "docs/examples/**/vite.config.ts",
      "docs/examples/**/vitest.config.ts",
      "tests/**/*.spec.ts",
      "tests/**/*.spec.tsx",
    ],
    plugins: ["typescript"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ["packages/**", "docs/examples/**", "tests/**", "docs/**"],
        plugins: ["typescript"],
      },
      {
        files: ["**/*.test.ts", "**/*.spec.ts", "**/*.story.test.ts"],
        plugins: ["typescript", "vitest"],
        rules: {
          "@typescript-eslint/no-explicit-any": "off",
        },
      },
    ],
  },
  fmt: {
    singleQuote: false,
    semi: true,
    ignorePatterns: [
      "**/dist/**",
      "**/dist-*/**",
      "**/node_modules/**",
      "docs/.astro/**",
      "docs/dist/**",
      "pnpm-lock.yaml",
      ".playwright-mcp/**",
    ],
  },
  resolve: {
    conditions: ["browser"],
  },
  test: {
    include: ["tests/**/*.story.test.ts"],
    server: {
      deps: {
        inline: ["svelte"],
      },
    },
    reporters: [
      "default",
      new StoryReporter({
        formats: ["markdown", "html"],
        outputDir: "docs/evidence",
        outputName: "vitest-tests",
        rawRunPath: ".executable-stories/vitest-raw-run.json",
        output: { mode: "aggregated" },
        markdown: {
          title: "Mountly Vitest Stories",
          includeStatusIcons: true,
          includeErrors: true,
          includeMetadata: true,
          sortScenarios: "source",
        },
        html: {
          title: "Mountly Vitest Stories",
          darkMode: false,
          searchable: true,
        },
      }) as unknown as Reporter,
    ],
  },
});
