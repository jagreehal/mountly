import { createSpec } from "./src/generate.mjs";

/**
 * See a model author a catalog-constrained UI spec — the blocking usage: fire
 * `createSpec` and `await` the final result (no streaming). For the live,
 * element-by-element build, see `stream-live.mjs`.
 *
 *   # local (default):
 *   node generate-live.mjs "a sales dashboard with 3 KPIs and an 'ask' button"
 *   # hosted (key from env, never hard-coded):
 *   GEN_PROVIDER=google GEN_MODEL=gemini-2.5-flash node generate-live.mjs "..."
 *   GEN_PROVIDER=groq   GEN_MODEL=llama-3.3-70b-versatile node generate-live.mjs "..."
 */
const prompt =
  process.argv.slice(2).join(" ") ||
  "A revenue dashboard with three KPIs and a button to ask the agent for the Q3 breakdown.";

console.error(`[generate] provider=${process.env.GEN_PROVIDER ?? "ollama"}`);
console.error(`[generate] prompt: ${prompt}\n`);

const started = Date.now();
const ui = await createSpec(prompt);
const { spec, raw, fixes, issues } = await ui.result; // await the handle for the final
const model = ui.model;
const ms = Date.now() - started;

// How well did the model adhere to the catalog? (the things small models miss)
const els = Object.values(spec.elements ?? {});
const types = new Set(els.map((e) => e.type));
const CATALOG = new Set(["Column", "Card", "Metric", "Button"]);
const offCatalog = [...types].filter((t) => !CATALOG.has(t));
const buttons = els.filter((e) => e.type === "Button");
const bind = (b) => b.on?.press ?? b.on?.click; // models prefer `press`
const wired = buttons.filter((b) => bind(b)?.action === "ask");
const goodButtons = wired.filter(
  (b) => typeof bind(b).params?.prompt === "string" && bind(b).params.prompt.length > 0,
);
const usesState = JSON.stringify(spec).includes("$state");

console.log("=== RAW MODEL OUTPUT (JSONL patches) ===");
console.log(raw.trim());
console.log("\n=== COMPILED + REPAIRED SPEC ===");
console.log(JSON.stringify(spec, null, 2));
console.log(`\n=== ${model} · ${els.length} elements · root='${spec.root}' · ${ms}ms ===`);
console.log(`off-catalog types : ${offCatalog.length ? offCatalog.join(", ") : "none ✓"}`);
console.log(
  `buttons           : ${buttons.length} | ${wired.length} wired →ask | ${goodButtons.length} with a non-empty prompt ✓`,
);
console.log(`uses $state binding: ${usesState ? "yes" : "no"}`);
if (fixes?.length) console.log("autoFix repairs   :", fixes);
if (issues?.errors?.length) console.log("validation errors :", issues.errors);
