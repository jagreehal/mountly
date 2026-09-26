// node lab/show.mjs <results.json> — one line per run: the tree it composed.
import { readFileSync } from "node:fs";
const s = (n) =>
  n.tag +
  (Object.keys(n.attrs ?? {}).length ? JSON.stringify(n.attrs) : "") +
  (n.children?.length ? `[${n.children.map(s).join(", ")}]` : "");
for (const file of process.argv.slice(2)) {
  for (const r of JSON.parse(readFileSync(file, "utf8"))) {
    console.log(
      `${r.model} ${r.strategy} p${r.prompt} ${r.correct ? "✓" : "✗"} ${r.errors?.join("; ") ?? r.error ?? ""}\n   ${r.tree ? s(r.tree) : ""}`,
    );
  }
}
