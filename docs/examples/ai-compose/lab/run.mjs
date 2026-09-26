import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createCatalog, loadCatalog, tagsIn } from "mountly-compose";
import { scope, STRATEGIES } from "./strategies.mjs";
import { DISTRACTORS } from "./distractors.mjs";

/**
 *   node lab/run.mjs                         # every strategy × model × prompt
 *   MODELS=gpt-oss:20b-cloud STRATEGIES=html,choose PROMPTS=0,1 node lab/run.mjs
 *   SCALE=1 node lab/run.mjs                 # add 40 unrelated widgets to the catalog
 */
const CONTEXT = {
  customerId: "cus_ada",
  orders: [
    { id: "ord_77", status: "shipped" },
    { id: "ord_81", status: "delivered" },
  ],
};

const find = (tree, tag) => {
  const hits = [];
  const walk = (n) => {
    if (n.tag === tag) hits.push(n);
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return hits;
};

const CHARGED_TWICE_PAGE = {
  tag: "ui-stack",
  attrs: {},
  children: [
    { tag: "billing-invoice-list", attrs: { "customer-id": "cus_ada", status: "all" } },
    { tag: "support-contact-card", attrs: { topic: "Billing" } },
  ],
};
const OWE_PAGE = {
  tag: "ui-stack",
  attrs: {},
  children: [
    { tag: "billing-balance-card", attrs: { "customer-id": "cus_ada" } },
    { tag: "billing-invoice-list", attrs: { "customer-id": "cus_ada", status: "all" } },
  ],
};

/**
 * `need`: must appear. `allow`: fine to appear. `check`: the ids/values are right.
 * `current` + `event` make it an edit turn; `keep` must survive the edit.
 */
export const PROMPTS = [
  {
    prompt: "I was charged twice this month and I'm fed up.",
    need: ["billing-invoice-list"],
    allow: ["support-contact-card", "support-ticket-list", "billing-balance-card"],
  },
  {
    prompt: "Where's my parcel?",
    need: ["shipping-order-tracker"],
    allow: [],
    check: (t) => find(t, "shipping-order-tracker").some((n) => n.attrs["order-id"] === "ord_77"),
  },
  {
    prompt: "The thing that arrived is broken, I want to send it back.",
    need: ["shipping-return-form"],
    allow: ["support-contact-card", "shipping-order-tracker"],
    check: (t) => find(t, "shipping-return-form").every((n) => n.attrs["order-id"] === "ord_81"),
  },
  {
    prompt: "What do I owe you?",
    need: ["billing-balance-card"],
    allow: ["billing-invoice-list"],
  },
  {
    prompt: "Show only my overdue invoices.",
    need: ["billing-invoice-list"],
    allow: ["billing-balance-card"],
    check: (t) => find(t, "billing-invoice-list").every((n) => n.attrs.status === "overdue"),
  },
  {
    prompt: "Give me an overview of my whole account.",
    need: ["billing-balance-card", "shipping-order-tracker", "support-ticket-list"],
    allow: ["billing-invoice-list", "support-contact-card"],
  },
  {
    current: CHARGED_TWICE_PAGE,
    event: { name: "pick-invoice", tag: "billing-invoice-list", detail: { invoiceId: "INV-0998" } },
    need: ["billing-invoice-detail"],
    allow: [
      "billing-invoice-list",
      "support-contact-card",
      "support-ticket-list",
      "billing-balance-card",
    ],
    check: (t) =>
      find(t, "billing-invoice-detail").every((n) => n.attrs["invoice-id"] === "INV-0998"),
  },
  {
    current: OWE_PAGE,
    prompt: "Only the overdue ones, please.",
    need: ["billing-invoice-list"],
    keep: ["billing-balance-card"],
    allow: [],
    check: (t) => find(t, "billing-invoice-list").every((n) => n.attrs.status === "overdue"),
  },
  {
    current: {
      tag: "ui-stack",
      attrs: {},
      children: [
        { tag: "billing-invoice-list", attrs: { "customer-id": "cus_ada", status: "all" } },
        { tag: "billing-invoice-detail", attrs: { "invoice-id": "INV-0998" } },
      ],
    },
    event: { name: "dispute", tag: "billing-invoice-detail", detail: { invoiceId: "INV-0998" } },
    need: ["support-contact-card"],
    keep: ["billing-invoice-detail"],
    allow: ["billing-invoice-list", "support-ticket-list"],
    check: (t) =>
      find(t, "billing-invoice-detail").every((n) => n.attrs["invoice-id"] === "INV-0998"),
  },
];

const env = (name, fallback) => (process.env[name] ? process.env[name].split(",") : fallback);
const models = env("MODELS", ["gpt-oss:20b-cloud", "qwen3.5:4b", "granite4.1:3b"]);
const strategies = env("STRATEGIES", Object.keys(STRATEGIES));
const promptIdx = env(
  "PROMPTS",
  PROMPTS.map((_, i) => String(i)),
).map(Number);
const scale = process.env.SCALE === "1";

const registry = new URL("../registry.json", import.meta.url);
const actions = JSON.parse(await readFile(new URL("../actions.json", import.meta.url), "utf8"));
let catalog = await loadCatalog(registry, { actions });
if (scale) catalog = createCatalog([...catalog.elements, ...DISTRACTORS], { actions });
// Containers (components with slots) arrange content like layout does, so they
// are neither needed nor extra; what counts is the content inside them.
const widgetTags = new Set(
  catalog.elements.filter((e) => e.team !== "host" && !e.slots).map((e) => e.tag),
);

const results = [];
for (const model of models) {
  for (const strategy of strategies) {
    // Jev is an evaluation model: it answers choice questions, it does not write trees.
    if (model === "jev" && strategy !== "choose") continue;
    for (const i of promptIdx) {
      const p = PROMPTS[i];
      const started = Date.now();
      const row = { model, strategy, prompt: i, scale };
      try {
        const out = await STRATEGIES[strategy]({
          model,
          prompt: p.prompt,
          context: CONTEXT,
          catalog,
          current: p.current,
          event: p.event,
        });
        const scoped = scope({ catalog, current: p.current, event: p.event });
        const errors = scoped.catalog.validate(out.tree, { require: scoped.require });
        const used = new Set(tagsIn(out.tree).filter((t) => widgetTags.has(t)));
        const need = [...p.need, ...(p.keep ?? [])];
        const hit = need.filter((t) => used.has(t)).length;
        const extra = [...used].filter((t) => !need.includes(t) && !p.allow.includes(t));
        Object.assign(row, {
          ok: true,
          valid: errors.length === 0,
          errors,
          recall: hit / need.length,
          extra,
          ids: p.check ? p.check(out.tree) : null,
          ms: Date.now() - started,
          inputTokens: out.inputTokens,
          calls: out.calls ?? 1,
          tree: out.tree,
        });
      } catch (error) {
        Object.assign(row, {
          ok: false,
          error: String(error.message ?? error).slice(0, 200),
          ms: Date.now() - started,
        });
      }
      // A page is correct when it renders, includes what was needed, adds nothing wrong, and the ids are right.
      row.correct = Boolean(
        row.ok && row.valid && row.recall === 1 && row.extra.length === 0 && row.ids !== false,
      );
      results.push(row);
      console.error(
        `${model.padEnd(18)} ${strategy.padEnd(11)} p${i} ${row.correct ? "✓" : "✗"} ${row.ms}ms` +
          (row.ok
            ? ` valid=${row.valid} recall=${row.recall} extra=${row.extra.join(",") || "-"} ids=${row.ids}`
            : ` ERROR ${row.error}`),
      );
    }
  }
}

const out = new URL(`./results/${scale ? "scale" : "base"}-${Date.now()}.json`, import.meta.url);
await mkdir(new URL("./results/", import.meta.url), { recursive: true });
await writeFile(out, JSON.stringify(results, null, 2));

console.log(`\n| model | strategy | correct | valid | recall | median ms | input tok |`);
console.log(`|---|---|---|---|---|---|---|`);
for (const model of models) {
  for (const strategy of strategies) {
    const rows = results.filter((r) => r.model === model && r.strategy === strategy);
    if (!rows.length) continue;
    const pct = (f) => `${Math.round((rows.filter(f).length / rows.length) * 100)}%`;
    const ms = rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
    const tok = rows.filter((r) => r.inputTokens).map((r) => r.inputTokens);
    const avgTok = tok.length ? Math.round(tok.reduce((a, b) => a + b, 0) / tok.length) : "-";
    const recall = rows.filter((r) => r.ok).reduce((a, r) => a + r.recall, 0) / rows.length;
    console.log(
      `| ${model} | ${strategy} | ${pct((r) => r.correct)} | ${pct((r) => r.valid)} | ${recall.toFixed(2)} | ${ms} | ${avgTok} |`,
    );
  }
}
console.log(`\nraw: ${out.pathname}`);

// A regression gate for component descriptions: fail below this share correct.
const floor = Number(process.env.MIN_CORRECT);
if (floor) {
  const share = results.filter((r) => r.correct).length / results.length;
  console.log(`correct ${Math.round(share * 100)}% (floor ${Math.round(floor * 100)}%)`);
  for (const r of results.filter((r) => !r.correct)) {
    console.log(
      `  ✗ ${r.model} ${r.strategy} p${r.prompt}: ${PROMPTS[r.prompt].prompt ?? PROMPTS[r.prompt].event?.name}`,
    );
  }
  if (share < floor) process.exitCode = 1;
}
