import { createSpec } from "./src/generate.mjs";

/**
 * Watch a model build a catalog-constrained UI spec **live** — the real
 * token → JSONL patch → spec path (`streamSpec` → json-render's stream
 * compiler), not a replay of a finished spec. Same one function as
 * `generate-live.mjs`; here we iterate `partialSpecStream` instead of awaiting.
 *
 *   # local (default — Ollama):
 *   node stream-live.mjs "a sales dashboard with 3 KPIs and an 'ask' button"
 *   # hosted (key from env):
 *   GEN_PROVIDER=groq GEN_MODEL=llama-3.3-70b-versatile node stream-live.mjs "..."
 */
const prompt =
  process.argv.slice(2).join(" ") ||
  "A revenue dashboard with three KPIs and a button to ask the agent for the Q3 breakdown.";

console.error(`[stream] provider=${process.env.GEN_PROVIDER ?? "ollama"}`);
console.error(`[stream] prompt: ${prompt}\n`);

const started = Date.now();
const ui = await createSpec(prompt);

// Iterate the live partials: each value is the progressively-built spec.
let steps = 0;
let lastCount = 0;
for await (const partial of ui.partialSpecStream) {
  steps++;
  const count = Object.keys(partial.elements ?? {}).length;
  if (count !== lastCount) {
    // One line per growth step — you can see the UI assembling itself.
    process.stdout.write(
      `  +${String(count - lastCount).padStart(2)} → ${String(count).padStart(2)} elements (${Date.now() - started}ms)\n`,
    );
    lastCount = count;
  }
}
const { spec, fixes, issues } = await ui.result; // the final, repaired result
const model = ui.model;
const ms = Date.now() - started;

console.log("\n=== FINAL SPEC ===");
console.log(JSON.stringify(spec, null, 2));
console.log(
  `\n=== ${model} · ${Object.keys(spec.elements ?? {}).length} elements · root='${spec.root}' · ${steps} stream steps · ${ms}ms ===`,
);
if (fixes?.length) console.log("autoFix repairs   :", fixes);
if (issues?.errors?.length) console.log("validation errors :", issues.errors);
