/**
 * Put `/* @vite-ignore *\/` back on the runtime `import()` calls.
 *
 * `dynamic-import.ts` carries the comment in source, but esbuild strips all
 * comments when minifying — `legalComments: "inline"` and `/*! ... *\/` don't
 * survive either, both verified. Vite matches that exact comment
 * (`/\/\*\s*@vite-ignore\s*\*\//`) to decide whether to warn about a dynamic
 * import it cannot analyse, so without it every consumer who bundles mountly
 * gets a warning about a specifier that is runtime-only by design.
 *
 * Trade-off: inserting characters shifts the sourcemap columns after the
 * insertion point on that line. That is a real if small cost, paid inside
 * mountly's own minified internals, to keep every consumer's build clean.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

// A bare identifier argument is a specifier only known at runtime; a literal
// (`import("./feature.js")`) is analysable and must be left alone.
const RUNTIME_IMPORT = /import\((?!\/\*)([A-Za-z_$][\w$]*)\)/g;

let annotated = 0;
for (const file of readdirSync(dist)) {
  if (!file.endsWith(".js")) continue;
  const path = join(dist, file);
  const before = readFileSync(path, "utf8");
  const after = before.replace(RUNTIME_IMPORT, (_match, id) => {
    annotated += 1;
    return `import(/* @vite-ignore */ ${id})`;
  });
  if (after !== before) writeFileSync(path, after);
}

if (annotated === 0) {
  throw new Error(
    "annotate-dynamic-imports: no runtime import() found to annotate. " +
      "The build shape changed — check that dynamic-import.ts still emits one.",
  );
}
console.log(`annotated ${annotated} runtime import() call(s)`);
