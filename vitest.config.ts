import { createRequire } from "node:module";
import type { Reporter } from "vitest/node";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const { StoryReporter } = require("executable-stories-vitest/reporter");

export default defineConfig({
  test: {
    include: ["tests/**/*.story.test.ts"],
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
