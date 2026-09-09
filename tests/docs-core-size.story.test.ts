import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

// Every place that quotes the core entry's size. The number has drifted twice;
// this keeps the docs honest instead of trusting a manual sweep.
const CLAIMS = [
  "README.md",
  "packages/mountly/README.md",
  "docs/src/content/docs/index.mdx",
  "docs/src/content/docs/concepts/islands.mdx",
  "docs/src/content/docs/frameworks/plain-html.mdx",
  "docs/src/content/docs/api/trigger-plugins.mdx",
];

// "2.3 KB", "2.3KB" — the size of mountly/auto, however it is spelled.
const SIZE = /(\d+\.\d+) ?KB/g;

describe("documented core size", () => {
  const dist = "packages/mountly/dist/auto.js";

  it.skipIf(!existsSync(dist))("matches the built auto.js", () => {
    const gz = gzipSync(readFileSync(dist), { level: 9 }).length;
    const actual = (Math.round((gz / 1024) * 10) / 10).toFixed(1);

    for (const file of CLAIMS) {
      const quoted = [...readFileSync(file, "utf8").matchAll(SIZE)].map((m) => m[1]);
      expect(quoted, `${file} quotes no core size — drop it from CLAIMS`).not.toHaveLength(0);
      for (const value of quoted) {
        expect(value, `${file} says ${value} KB, auto.js is ${actual} KB`).toBe(actual);
      }
    }
  });
});
