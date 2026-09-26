import { parseFragment } from "parse5";
import { z } from "zod";
import {
  autoFixSpec,
  compileSpecStream,
  defineCatalog,
  experimental_composeSpec,
} from "./vendor/json-render-core-next.mjs";
import { schema } from "./vendor/json-render-react-schema.mjs";
import { tagsIn } from "mountly-compose";

const OLLAMA = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/**
 * `opencode/<id>` goes to an OpenAI-compatible host (HOSTED_BASE_URL, key in
 * HOSTED_API_KEY or OPENCODE_API_KEY — run with `node --env-file=…`); anything
 * else is an Ollama model.
 */
export async function chat(model, messages, format, onText) {
  if (model.startsWith("opencode/"))
    return hosted(model.slice("opencode/".length), messages, format, onText);
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      model,
      messages,
      stream: Boolean(onText),
      think: false,
      options: { temperature: 0 },
      ...(format ? { format } : {}),
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  if (!onText) {
    const body = await res.json();
    return { text: body.message.content, inputTokens: body.prompt_eval_count ?? null };
  }
  // Streaming: one JSON object per line, the last carrying the token count.
  let text = "";
  let inputTokens = null;
  for await (const line of lines(res.body)) {
    const event = JSON.parse(line);
    const delta = event.message?.content ?? "";
    if (delta) {
      text += delta;
      onText(delta);
    }
    if (event.done) inputTokens = event.prompt_eval_count ?? null;
  }
  return { text, inputTokens };
}

/** The lines of a streamed response body, as they arrive. */
async function* lines(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

const sessionId = crypto.randomUUID();

async function hosted(model, messages, format, onText) {
  const base = process.env.HOSTED_BASE_URL ?? "https://opencode.ai/zen/go/v1";
  const key = process.env.HOSTED_API_KEY ?? process.env.OPENCODE_API_KEY;
  if (!key) throw new Error("set HOSTED_API_KEY or OPENCODE_API_KEY");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      // opencode.ai/zen requires a session header; other hosts ignore it.
      "x-opencode-session": sessionId,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      // Without this, mimo writes ~1,300 reasoning tokens per answer.
      reasoning_effort: "none",
      ...(onText ? { stream: true, stream_options: { include_usage: true } } : {}),
      ...(format
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: "reply", schema: format },
            },
          }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`hosted ${res.status}: ${(await res.text()).slice(0, 200)}`);
  if (onText) {
    // Server-sent events: `data: {…}` per chunk, `data: [DONE]` at the end.
    let text = "";
    let inputTokens = null;
    for await (const line of lines(res.body)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") break;
      const event = JSON.parse(data);
      const delta = event.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        text += delta;
        onText(delta);
      }
      if (event.usage) inputTokens = event.usage.prompt_tokens ?? null;
    }
    return { text, inputTokens };
  }
  const body = await res.json();
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    inputTokens: body.usage?.prompt_tokens ?? null,
  };
}

/** Jev answers the composer's choice questions natively. */
export async function jevEvaluator(usage) {
  const { createTypeSafeAi } = await import("@ai-sdk/typesafe-ai");
  const { experimental_evaluate: evaluate } = await import("ai");
  const model = createTypeSafeAi({ apiKey: process.env.TYPESAFE_API_KEY }).evaluationModel(
    "jev-latest",
  );
  return async ({ state, questions, signal }) => {
    const result = await evaluate({
      model,
      state: JSON.parse(JSON.stringify(state)),
      questions,
      abortSignal: signal,
    });
    usage.push(result.usage.inputTokens ?? null);
    return {
      answers: Object.fromEntries(
        Object.entries(result.answers).map(([name, answer]) => [
          name,
          { choice: answer.choice, confidence: answer.probabilities?.[answer.choice] },
        ]),
      ),
      usage: { inputTokens: result.usage.inputTokens },
    };
  };
}

const contextText = (context) =>
  `Signed-in customer: ${context.customerId}. Orders: ${context.orders
    .map((o) => `${o.id} (${o.status})`)
    .join(", ")}.`;

/** The user message: context, the page on screen and any widget event, then the request. */
const userMessage = ({ full, catalog, prompt, context, current, event }) =>
  (full ?? catalog).turn({ request: prompt, context: contextText(context), current, event });

/** 1. Free-form markup. Models have read a lot of HTML. */
export async function html(args) {
  const system = args.catalog.prompt({ output: "html" });
  const { text, inputTokens } = await chat(args.model, [
    { role: "system", content: system },
    { role: "user", content: userMessage(args) },
  ]);
  // `<x-y />` does not close a custom element in HTML; the parser would nest
  // everything after it inside. Models write it anyway, so accept it.
  const markup = text
    .replace(/```(?:html)?/g, "")
    // Quoted values may contain `>`; they are skipped whole.
    .replace(/<([a-z][\w-]*)((?:"[^"]*"|'[^']*'|[^'"<>])*?)\s*\/>/g, "<$1$2></$1>")
    .trim();
  const roots = parseFragment(markup).childNodes.map(fromParse5).filter(Boolean);
  const tree = roots.length === 1 ? roots[0] : { tag: "ui-stack", attrs: {}, children: roots };
  return { tree, raw: markup, inputTokens, systemChars: system.length };
}

function fromParse5(node) {
  if (!node.tagName) return null;
  return {
    tag: node.tagName,
    attrs: Object.fromEntries(node.attrs.map((a) => [a.name, a.value])),
    children: (node.childNodes ?? []).map(fromParse5).filter(Boolean),
  };
}

/**
 * Hosted models may ignore `format` (Ollama's cloud models do) and wrap the
 * JSON in a code fence or a sentence. The outermost object is still the answer.
 */
export function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error(`no JSON object in: ${text.slice(0, 80)}`);
  return JSON.parse(text.slice(start, end + 1));
}

/** 2. JSON constrained by a schema derived from the catalog: invalid output cannot be sampled. */
export async function constrained(args) {
  const { model, catalog, require = [] } = args;
  const system = catalog.prompt();
  const messages = [
    { role: "system", content: system },
    { role: "user", content: userMessage(args) },
  ];
  // `onText` streams the reply as it is written; `onReset` says a retry follows.
  let reply = await chat(model, messages, catalog.jsonSchema(), args.onText);
  // One repair turn: the validator's own words are the clearest correction.
  const errors = checked(reply.text, catalog, require);
  if (errors.length) {
    // Small mistakes (a stray attribute, an out-of-range value) cost nothing to strip.
    const { tree: fixed } = catalog.repair(safeParse(reply.text));
    if (fixed && !catalog.validate(fixed, { require }).length) {
      return {
        tree: fixed,
        raw: reply.text,
        inputTokens: reply.inputTokens,
        systemChars: system.length,
        repaired: true,
      };
    }
    messages.push(
      { role: "assistant", content: reply.text },
      {
        role: "user",
        content: `That page cannot be used:\n${errors.join("\n")}\nReply with the corrected tree.`,
      },
    );
    args.onReset?.();
    const retry = await chat(model, messages, catalog.jsonSchema(), args.onText);
    return {
      tree: parseJson(retry.text),
      raw: retry.text,
      inputTokens: (reply.inputTokens ?? 0) + (retry.inputTokens ?? 0),
      systemChars: system.length,
      calls: 2,
    };
  }
  return {
    tree: parseJson(reply.text),
    raw: reply.text,
    inputTokens: reply.inputTokens,
    systemChars: system.length,
  };
}

function safeParse(text) {
  try {
    return parseJson(text);
  } catch {
    return undefined;
  }
}

function checked(text, catalog, require) {
  try {
    return catalog.validate(parseJson(text), { require });
  } catch (error) {
    return [String(error.message ?? error)];
  }
}

/** A json-render catalog built from the same elements, props keyed by attribute name. */
export function jsonRenderCatalog(elements) {
  const prop = (a) =>
    (a.values
      ? z.enum(a.values)
      : a.type === "number"
        ? z.number()
        : a.type === "boolean"
          ? z.boolean()
          : z.string()
    ).optional();
  return defineCatalog(schema, {
    components: Object.fromEntries(
      elements.map((el) => [
        el.tag,
        {
          props: z.object(Object.fromEntries(el.attributes.map((a) => [a.name, prop(a)]))),
          ...(el.leaf ? {} : { slots: ["default"] }),
          events: el.events.map((e) => e.name),
          description: el.description,
        },
      ]),
    ),
    actions: {},
  });
}

function specToTree(spec) {
  const visit = (key) => {
    const el = spec.elements[key];
    if (!el) return { tag: `missing:${key}`, attrs: {}, children: [] };
    return {
      tag: el.type,
      attrs: Object.fromEntries(
        Object.entries(el.props ?? {}).filter(([, v]) => v !== undefined && v !== null),
      ),
      children: (el.children ?? []).map(visit),
    };
  };
  return visit(spec.root);
}

/** 3. json-render's own generation: its catalog prompt, JSONL patches, autofix. */
export async function spec(args) {
  const system = jsonRenderCatalog(args.catalog.elements).prompt({
    customRules: [
      "Compose the smallest page that answers the user. Fill ids from the context. The root is ui-stack.",
      "Every attribute value must be a literal, not a $state expression.",
    ],
  });
  const { text, inputTokens } = await chat(args.model, [
    { role: "system", content: system },
    { role: "user", content: userMessage(args) },
  ]);
  const compiled = compileSpecStream(text.replace(/```\w*/g, ""));
  const { spec: fixed } = autoFixSpec(compiled);
  if (!fixed?.root) throw new Error("no spec root");
  return { tree: specToTree(fixed), raw: text, inputTokens, systemChars: system.length };
}

/**
 * Candidates derived from the catalog and the request context, with no
 * per-widget code: `*-id` attributes are filled from context records, and an
 * enum or boolean attribute becomes mutually exclusive variants.
 */
export function candidatesFor(elements, context, params = {}) {
  const out = [
    { id: "stack", description: "Page column", element: { type: "ui-stack", props: {} } },
    {
      id: "grid",
      description: "Side-by-side row of related widgets",
      element: { type: "ui-grid", props: { columns: 2 } },
      root: false,
      maxUses: 2,
    },
  ];
  for (const el of elements) {
    if (el.team === "host") continue;
    let variants = [{ props: {}, notes: [] }];
    for (const a of el.attributes) {
      let options;
      // An action's params fill the matching attribute: `invoiceId` → `invoice-id`.
      const param = params[a.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
      if (param !== undefined) options = [[param, ""]];
      else if (a.name === "customer-id") options = [[context.customerId, ""]];
      else if (a.name === "order-id")
        options = context.orders.map((o) => [o.id, `order ${o.id} (${o.status})`]);
      else if (a.values) options = a.values.map((v) => [v, `${a.name}=${v}`]);
      else if (a.type === "boolean")
        options = [
          [false, ""],
          [true, a.description || a.name],
        ];
      else continue; // free text cannot be chosen, only generated
      variants = variants.flatMap((v) =>
        options.map(([value, note]) => ({
          props: { ...v.props, [a.name]: value },
          notes: note ? [...v.notes, note] : v.notes,
        })),
      );
    }
    const exclusive = variants.length > 1 && !el.attributes.some((a) => a.name === "order-id");
    variants.forEach((v, i) =>
      out.push({
        id: `${el.tag}${variants.length > 1 ? `-${i}` : ""}`,
        description: `${el.description}${v.notes.length ? ` [${v.notes.join(", ")}]` : ""}`,
        element: { type: el.tag, props: v.props },
        root: false,
        ...(exclusive ? { resource: el.tag } : {}),
      }),
    );
  }
  return out;
}

export function ollamaEvaluator(model, usage) {
  return async ({ state, questions }) => {
    const format = {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(questions).map(([name, q]) => [
          name,
          { type: "string", enum: Object.keys(q.criteria) },
        ]),
      ),
      required: Object.keys(questions),
    };
    const { text, inputTokens } = await chat(
      model,
      [
        {
          role: "system",
          content:
            "Answer each question by choosing exactly one of its criteria keys. Reply as a JSON object mapping question name to the chosen key.",
        },
        { role: "user", content: JSON.stringify({ state, questions }, null, 1) },
      ],
      format,
    );
    usage.push(inputTokens);
    const picked = parseJson(text);
    return {
      answers: Object.fromEntries(Object.keys(questions).map((q) => [q, { choice: picked[q] }])),
      usage: { inputTokens: inputTokens ?? undefined },
    };
  };
}

/** 4. json-render's experimental composer: the model only chooses among prepared candidates. */
export async function choose(args) {
  const { model, context, catalog } = args;
  const usage = [];
  let result;
  for await (const event of experimental_composeSpec({
    catalog: jsonRenderCatalog(catalog.elements),
    candidates: candidatesFor(catalog.elements, context, args.action?.params),
    // The composer takes one request string; the event and current page ride in it.
    prompt: catalog.turn({ request: args.prompt, current: args.current, event: args.event }),
    context: { customer: contextText(context) },
    evaluate: model === "jev" ? await jevEvaluator(usage) : ollamaEvaluator(model, usage),
    maxSteps: 8,
  })) {
    if (event.type === "complete") result = event;
  }
  if (!result?.spec) throw new Error(`composer stopped: ${result?.stopReason}`);
  return {
    tree: specToTree(result.spec),
    raw: JSON.stringify(result.spec),
    inputTokens: usage.reduce((a, b) => a + (b ?? 0), 0),
    systemChars: 0,
    calls: usage.length,
  };
}

/**
 * 5. Two passes, for catalogs too big to send whole: pick up to five tags from
 * one-line descriptions, then compose (constrained) from only those.
 */
export async function shortlist(args) {
  const { model, catalog, current } = args;
  // A host action already says what to draw on: no selection pass needed.
  if (args.action) return constrained(args);
  const widgets = catalog.elements.filter((el) => el.team !== "host");
  const pick = await chat(
    model,
    [
      {
        role: "system",
        content: `Pick the widgets (at most 5) a page answering the user needs. Only what is asked for.\n\n${catalog.menu()}`,
      },
      { role: "user", content: userMessage(args) },
    ],
    {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string", enum: widgets.map((el) => el.tag) },
          maxItems: 5,
        },
      },
      required: ["tags"],
    },
  );
  // Hosted models may ignore `format` and answer in prose or markup; any
  // catalog tag they name is still a usable pick.
  const chosen = widgets.map((el) => el.tag).filter((tag) => pick.text.includes(tag));
  // Whatever is on the page stays available, so an edit can keep it.
  const onPage = current ? tagsIn(current) : [];
  const out = await constrained({ ...args, catalog: catalog.narrow([...chosen, ...onPage]) });
  return { ...out, inputTokens: (pick.inputTokens ?? 0) + (out.inputTokens ?? 0), calls: 2 };
}

/**
 * On an action turn: the catalog scoped to that action (no free text unless it
 * shows some) and the widgets the page must include. Otherwise the whole catalog.
 */
export function scope({ catalog, current, event }) {
  const action = event && catalog.action(event);
  return action
    ? { action, catalog: catalog.forAction(action, current), require: action.show }
    : { catalog, require: [] };
}

/** Every strategy answers an action turn from the same scoped catalog. */
export const STRATEGIES = Object.fromEntries(
  Object.entries({ html, constrained, spec, choose, shortlist }).map(([name, run]) => [
    name,
    (args) => run({ ...args, full: args.catalog, ...scope(args) }),
  ]),
);
