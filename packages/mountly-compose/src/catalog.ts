/** The catalog: what teams publish, read into what a host drives a model with. */
import { coerce, problems } from "./schema.js";

export interface Registry {
  teams: Array<{ id: string; embed: string; elements: string }>;
}

export interface CatalogAttribute {
  name: string;
  /** The type as the author wrote it, e.g. `string` or `"paid" | "overdue"`. */
  type: string;
  description: string;
  /** The allowed values, when the type is a union of string literals. */
  values?: string[];
  /** JSON Schema for the value, when the build derived one from the prop's type and JSDoc. */
  schema?: Record<string, unknown>;
}

export interface CatalogEvent {
  name: string;
  description: string;
}

export interface CatalogElement {
  tag: string;
  /** The owning team, or `"host"` for layout the page provides. */
  team: string;
  /** Absolute URL of the script that defines the tag. Absent for host layout. */
  embed?: string;
  description: string;
  attributes: CatalogAttribute[];
  events: CatalogEvent[];
  /** Whether the element takes no children: team widgets, unless they declare slots. */
  leaf: boolean;
  /** Where children go, for a team component that renders the page's children. `""` is the default slot. */
  slots?: Array<{ name: string; description: string }>;
}

/** What a model returns and a host renders. */
export interface Tree {
  tag: string;
  /** Objects and arrays render as JSON attributes, which the element parses. */
  attrs?: Record<string, unknown>;
  /** The parent's named slot this element fills. Omit for the default slot. */
  slot?: string;
  children?: Tree[];
}

/** A DOM event a widget fired, to be answered by the next turn. */
export interface TurnEvent {
  name: string;
  tag: string;
  detail?: unknown;
}

export interface TurnOptions {
  /** What the user asked. */
  request?: string;
  /** Facts the model may use to fill attributes: signed-in ids, records. */
  context?: string;
  /** The page on screen. When given, the model edits it instead of starting over. */
  current?: Tree;
  /** What the user just did inside a widget. */
  event?: TurnEvent;
}

/**
 * What a widget event means, named by the host. Teams publish events; the host
 * decides which of them the agent answers and what each is for.
 *
 * ```ts
 * "show-invoice": {
 *   description: "Show that invoice in full, keeping the list.",
 *   on: ["billing-invoice-list:pick-invoice"],
 *   params: ["invoiceId"],
 *   show: ["billing-invoice-detail"],
 * }
 * ```
 */
export interface ActionDefinition {
  /** What taking the action means, for the model. */
  description: string;
  /** The widget events that take it, as `tag:event`. */
  on: string[];
  /** The event detail keys passed to the model. Anything else is dropped. */
  params?: string[];
  /** The tags the next page should draw on. Lets a host skip a selection pass. */
  show?: string[];
}

export type Actions = Record<string, ActionDefinition>;

/** An event resolved to the host action it takes. */
export interface ResolvedAction {
  name: string;
  description: string;
  params: Record<string, unknown>;
  show: string[];
}

export interface CatalogOptions {
  /** Named actions for widget events. Without any, every declared event reaches the model as-is. */
  actions?: Actions;
}

export interface PromptOptions {
  /** Reply format the prompt asks for. Default `"json"`, the shape of {@link Tree}. */
  output?: "json" | "html";
  /** Extra rules, appended after the built-in ones. */
  rules?: string[];
}

export interface Catalog {
  readonly elements: readonly CatalogElement[];
  readonly actions: Actions;
  /** The action a widget event takes, with its declared params. Undefined when unmapped. */
  action(event: TurnEvent): ResolvedAction | undefined;
  /** The event names a host should listen for: those with actions, or every declared one. */
  triggers(): string[];
  /** The system prompt: rules plus every tag, attribute and description. */
  prompt(options?: PromptOptions): string;
  /** One line per team widget, for a first pass that picks what to use. */
  menu(): string;
  /** JSON Schema for a {@link Tree} of this catalog, for constrained decoding. */
  jsonSchema(): Record<string, unknown>;
  /** Every reason the tree may not be rendered. Empty means it is safe. */
  validate(tree: unknown, options?: { require?: Iterable<string> }): string[];
  /**
   * The tree with everything invalid removed: unknown elements (and what they
   * contain), unknown or invalid attributes, children of leaf elements. Cheaper
   * than asking the model again when the mistakes are small; `dropped` says
   * what went. Required widgets are not invented — check them after.
   */
  repair(tree: unknown): { tree: Tree | undefined; dropped: string[] };
  /** Host layout plus only these tags, for a second pass. */
  narrow(tags: Iterable<string>): Catalog;
  /**
   * The catalog for answering an action: what it shows, what is on the page,
   * and host containers. Host text elements (`ui-note`) are left out unless
   * the action shows them: what the host did is the host's to report.
   */
  forAction(action: ResolvedAction, current?: Tree): Catalog;
  /** The user message for one turn, including the current page when editing. */
  turn(options: TurnOptions): string;
}

/** Layout the page owns: teams supply content, the host decides arrangement. */
export const DEFAULT_LAYOUT: CatalogElement[] = [
  {
    tag: "ui-stack",
    team: "host",
    description: "Vertical column of children. Use as the root.",
    attributes: [],
    events: [],
    leaf: false,
  },
  {
    tag: "ui-grid",
    team: "host",
    description: "Side-by-side columns of children, for related widgets.",
    attributes: [{ name: "columns", type: "number", description: "1 to 3" }],
    events: [],
    leaf: false,
  },
  {
    tag: "ui-note",
    team: "host",
    description: "One short sentence of text addressed to the user.",
    attributes: [{ name: "text", type: "string", description: "" }],
    events: [],
    leaf: true,
  },
];

/** `"paid" | "overdue"` → `["paid", "overdue"]`; any other type → undefined. */
function literals(text: string | undefined): string[] | undefined {
  if (!text) return undefined;
  const parts = text.split("|").map((part) => part.trim());
  return parts.every((part) => /^"[^"]*"$/.test(part))
    ? parts.map((part) => part.slice(1, -1))
    : undefined;
}

interface CemDeclaration {
  customElement?: boolean;
  tagName?: string;
  description?: string;
  attributes?: Array<{
    name: string;
    type?: { text?: string };
    description?: string;
    schema?: Record<string, unknown>;
  }>;
  events?: Array<{ name: string; description?: string }>;
  slots?: Array<{ name: string; description?: string }>;
}

/** The elements one team's `custom-elements.json` declares. */
export function elementsFromCem(
  cem: { modules?: Array<{ declarations?: CemDeclaration[] }> },
  team: string,
  embed?: string,
): CatalogElement[] {
  return (cem.modules ?? []).flatMap((module) =>
    (module.declarations ?? [])
      .filter((d) => d.customElement && d.tagName)
      .map((d) => ({
        tag: d.tagName!,
        team,
        ...(embed ? { embed } : {}),
        description: d.description ?? "",
        attributes: (d.attributes ?? []).map((a) => {
          const values = literals(a.type?.text);
          return {
            name: a.name,
            type: a.type?.text ?? "string",
            description: a.description ?? "",
            ...(values ? { values } : {}),
            ...(a.schema ? { schema: a.schema } : {}),
          };
        }),
        events: (d.events ?? []).map((e) => ({ name: e.name, description: e.description ?? "" })),
        ...(d.slots?.length
          ? {
              slots: d.slots.map((slot) => ({
                name: slot.name,
                description: slot.description ?? "",
              })),
            }
          : {}),
        leaf: !d.slots?.length,
      })),
  );
}

async function readUrl(url: URL): Promise<string> {
  // Node's fetch cannot read file: URLs, and a lab or server usually starts there.
  if (url.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    return readFile(url, "utf8");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`[mountly-compose] ${url}: HTTP ${response.status}`);
  return response.text();
}

export interface LoadCatalogOptions extends CatalogOptions {
  /** How to read the registry and each description file. Defaults to fetch (or the file system for file: URLs). */
  read?: (url: URL) => Promise<string>;
  /** The page's own layout elements. Defaults to {@link DEFAULT_LAYOUT}. */
  layout?: CatalogElement[];
}

/**
 * Read a registry and every team's `custom-elements.json` it points at. Paths
 * in the registry resolve against the registry's own URL.
 */
export async function loadCatalog(
  registryUrl: string | URL,
  options: LoadCatalogOptions = {},
): Promise<Catalog> {
  const read = options.read ?? readUrl;
  const base = new URL(registryUrl);
  const registry = JSON.parse(await read(base)) as Registry;
  const teams = await Promise.all(
    registry.teams.map(async (team) =>
      elementsFromCem(
        JSON.parse(await read(new URL(team.elements, base))),
        team.id,
        new URL(team.embed, base).href,
      ),
    ),
  );
  return createCatalog([...(options.layout ?? DEFAULT_LAYOUT), ...teams.flat()], options);
}

const RULES = [
  "Compose the smallest page that answers the user.",
  "Use only the listed tags and attributes, with literal values.",
  "Fill ids from the context; never invent one.",
  "The root is <ui-stack>.",
];

export function createCatalog(elements: CatalogElement[], options: CatalogOptions = {}): Catalog {
  const byTag = new Map(elements.map((el) => [el.tag, el]));
  const [root] = elements.filter((el) => !el.leaf);
  const actions = options.actions ?? {};

  // Every action names a real tag, event and widget, checked up front.
  const byTrigger = new Map<string, string>();
  for (const [name, action] of Object.entries(actions)) {
    for (const trigger of action.on) {
      const [tag = "", event = ""] = trigger.split(":");
      if (!byTag.get(tag)?.events.some((e) => e.name === event)) {
        throw new Error(`[mountly-compose] action "${name}": no <${tag}> declares "${event}"`);
      }
      byTrigger.set(trigger, name);
    }
    for (const tag of action.show ?? []) {
      if (!byTag.has(tag))
        throw new Error(`[mountly-compose] action "${name}": unknown tag <${tag}>`);
    }
  }

  /** A smaller catalog, keeping only the actions whose widgets all survived. */
  const subset = (kept: CatalogElement[]): Catalog => {
    const present = new Set(kept.map((el) => el.tag));
    const valid = Object.entries(actions).filter(([, a]) =>
      [...a.on.map((t) => t.split(":")[0]!), ...(a.show ?? [])].every((tag) => present.has(tag)),
    );
    return createCatalog(kept, { actions: Object.fromEntries(valid) });
  };

  const resolve = (event: TurnEvent): ResolvedAction | undefined => {
    const name = byTrigger.get(`${event.tag}:${event.name}`);
    if (!name) return undefined;
    const action = actions[name]!;
    const detail = (event.detail ?? {}) as Record<string, unknown>;
    return {
      name,
      description: action.description,
      params: Object.fromEntries(
        (action.params ?? []).filter((key) => key in detail).map((key) => [key, detail[key]]),
      ),
      show: action.show ?? [],
    };
  };

  const describe = () =>
    elements
      .map((el) => {
        const where = el.slots
          ? ` (slots: ${el.slots.map((slot) => `${slot.name || "default"} — ${slot.description}`).join("; ")})`
          : el.leaf
            ? ""
            : " (container)";
        const head = `<${el.tag}>${where} — ${el.description}`;
        // Events are left out: the host listens for every declared one and
        // turns it into the next turn, so the model never wires one.
        const attrs = el.attributes.map(
          (a) => `    ${a.name}: ${a.type}${a.description ? ` — ${a.description}` : ""}`,
        );
        return [head, ...attrs].join("\n");
      })
      .join("\n");

  const attrSchema = (a: CatalogAttribute) =>
    a.schema ??
    (a.values
      ? { type: "string", enum: a.values }
      : { type: a.type === "number" ? "number" : a.type === "boolean" ? "boolean" : "string" });

  // Named slots only: the default slot is a child without `slot`.
  const slotNames = [
    ...new Set(elements.flatMap((el) => el.slots?.map((slot) => slot.name) ?? [])),
  ].filter(Boolean);
  const namedSlots = slotNames.length > 0;

  /** Why a child may not go where it is: a slot its parent does not render. */
  const slotProblem = (parent: CatalogElement, child: Tree): string | undefined => {
    if (!parent.slots) {
      return child.slot === undefined ? undefined : `<${parent.tag}> has no slot "${child.slot}"`;
    }
    const name = child.slot ?? "";
    if (parent.slots.some((slot) => slot.name === name)) return undefined;
    return name
      ? `<${parent.tag}> has no slot "${name}"`
      : `<${parent.tag}> has no default slot; set "slot" to one of ${parent.slots.map((slot) => slot.name).join("|")}`;
  };

  /** Why an attribute value may not be used, or nothing when it may. */
  const attrProblems = (attr: CatalogAttribute, value: unknown): string[] => {
    if (attr.schema) return problems(coerce(value, attr.schema), attr.schema);
    if (value === null || typeof value === "object") {
      return [`must be a literal, got ${JSON.stringify(value)}`];
    }
    if (attr.values && !attr.values.includes(String(value as string | number | boolean))) {
      return [`is not one of ${attr.values.join("|")}`];
    }
    return [];
  };

  return {
    elements,
    actions,
    action: resolve,

    triggers() {
      const names = Object.keys(actions).length
        ? Object.values(actions).flatMap((a) => a.on.map((t) => t.split(":")[1]!))
        : elements.flatMap((el) => el.events.map((e) => e.name));
      return [...new Set(names)];
    },

    prompt({ output = "json", rules = [] } = {}) {
      const reply =
        output === "html"
          ? "Reply with HTML only: no prose, no code fences, every element closed explicitly."
          : namedSlots
            ? 'Reply with a JSON tree: {"tag","attrs","children"}. A child placed in a named slot sets "slot" to that name; everywhere else, leave "slot" out.'
            : 'Reply with a JSON tree: {"tag","attrs","children"}.';
      return [
        "You build pages from a company's web components.",
        ...RULES,
        ...rules,
        reply,
        "",
        "Components:",
        describe(),
        ...(Object.keys(actions).length
          ? [
              "",
              "Actions (the page runs these when the user acts in a widget; include the widget if the action would help):",
              ...Object.entries(actions).map(
                ([name, a]) => `- ${name} — ${a.description} From ${a.on.join(", ")}.`,
              ),
            ]
          : []),
      ].join("\n");
    },

    menu() {
      return elements
        .filter((el) => el.team !== "host")
        .map((el) => `${el.tag} — ${el.description}`)
        .join("\n");
    },

    jsonSchema() {
      const defs: Record<string, unknown> = Object.fromEntries(
        elements.map((el) => [
          el.tag,
          {
            type: "object",
            properties: {
              tag: { const: el.tag },
              attrs: {
                type: "object",
                properties: Object.fromEntries(el.attributes.map((a) => [a.name, attrSchema(a)])),
                additionalProperties: false,
              },
              ...(el.leaf ? {} : { children: { type: "array", items: { $ref: "#/$defs/node" } } }),
              ...(slotNames.length ? { slot: { enum: slotNames } } : {}),
            },
            required: el.leaf ? ["tag", "attrs"] : ["tag", "attrs", "children"],
            additionalProperties: false,
          },
        ]),
      );
      defs.node = { anyOf: elements.map((el) => ({ $ref: `#/$defs/${el.tag}` })) };
      return { $ref: `#/$defs/${root?.tag ?? elements[0]?.tag}`, $defs: defs };
    },

    validate(tree, { require = [] } = {}) {
      const errors: string[] = [];
      const walk = (node: unknown, path: string) => {
        if (!node || typeof node !== "object" || typeof (node as Tree).tag !== "string") {
          errors.push(`${path}: not an element`);
          return;
        }
        const { tag, attrs = {}, children = [] } = node as Tree;
        const el = byTag.get(tag);
        if (!el) {
          errors.push(`${path}: unknown tag <${tag}>`);
          return;
        }
        for (const [name, value] of Object.entries(attrs)) {
          const attr = el.attributes.find((a) => a.name === name);
          if (!attr) {
            errors.push(`${path}: <${tag}> has no attribute "${name}"`);
            continue;
          }
          const label =
            typeof value === "string" ? `<${tag} ${name}="${value}">` : `<${tag} ${name}>`;
          for (const problem of attrProblems(attr, value))
            errors.push(`${path}: ${label} ${problem}`);
        }
        if (!Array.isArray(children)) errors.push(`${path}: children must be a list`);
        else if (el.leaf && children.length) errors.push(`${path}: <${tag}> takes no children`);
        else {
          children.forEach((child, index) => {
            const problem = child && typeof child === "object" && slotProblem(el, child as Tree);
            if (problem) errors.push(`${path}/${index}: ${problem}`);
            walk(child, `${path}/${index}`);
          });
        }
      };
      walk(tree, "root");
      if (!errors.length) {
        const present = new Set(tagsIn(tree as Tree));
        for (const tag of require) if (!present.has(tag)) errors.push(`root: missing <${tag}>`);
      }
      return errors;
    },

    repair(tree) {
      const dropped: string[] = [];
      const fix = (node: unknown, path: string): Tree | undefined => {
        if (!node || typeof node !== "object" || typeof (node as Tree).tag !== "string") {
          dropped.push(`${path}: not an element`);
          return undefined;
        }
        const { tag, attrs = {}, children = [] } = node as Tree;
        const el = byTag.get(tag);
        if (!el) {
          dropped.push(`${path}: <${tag}>`);
          return undefined;
        }
        const kept: NonNullable<Tree["attrs"]> = {};
        for (const [name, value] of Object.entries(attrs)) {
          const attr = el.attributes.find((a) => a.name === name);
          if (attr && !attrProblems(attr, value).length) kept[name] = value;
          else dropped.push(`${path}: <${tag} ${name}>`);
        }
        const list = Array.isArray(children) ? children : [];
        if (el.leaf && list.length) dropped.push(`${path}: children of <${tag}>`);
        const fixed = el.leaf
          ? []
          : list.flatMap((child, index) => {
              const at = `${path}/${index}`;
              if (child && typeof child === "object" && slotProblem(el, child as Tree)) {
                const { slot, ...unslotted } = child as Tree;
                dropped.push(`${at}: slot "${slot ?? ""}" of <${tag}>`);
                // Default content is fine where the slot was not: keep the child, lose the slot.
                if (slot === undefined || slotProblem(el, unslotted)) return [];
                return fix(unslotted, at) ?? [];
              }
              return fix(child, at) ?? [];
            });
        const slot = (node as Tree).slot;
        return { tag, attrs: kept, ...(slot === undefined ? {} : { slot }), children: fixed };
      };
      return { tree: fix(tree, "root"), dropped };
    },

    narrow(tags) {
      const keep = new Set(tags);
      return subset(elements.filter((el) => el.team === "host" || keep.has(el.tag)));
    },

    forAction(action, current) {
      const widgets = new Set([...action.show, ...(current ? tagsIn(current) : [])]);
      return subset(
        elements.filter((el) =>
          el.team === "host" ? !el.leaf || action.show.includes(el.tag) : widgets.has(el.tag),
        ),
      );
    },

    turn({ request, context, current, event }) {
      const parts: string[] = [];
      if (context) parts.push(`Context: ${context}`);
      if (current) {
        parts.push(
          "Current page — change only what the user's action or request calls for; " +
            "keep every element that still helps, in the same order:",
          JSON.stringify(current),
        );
      }
      const action = event && resolve(event);
      if (action) {
        parts.push(
          `The user chose "${action.name}"` +
            `${Object.keys(action.params).length ? ` with ${JSON.stringify(action.params)}` : ""}: ` +
            action.description +
            (action.show.length
              ? ` The page must include ${action.show.map((t) => `<${t}>`).join(", ")}.`
              : ""),
        );
      } else if (event) {
        const declared = byTag.get(event.tag)?.events.find((e) => e.name === event.name);
        parts.push(
          `The user just did "${event.name}" on <${event.tag}>` +
            `${event.detail === undefined ? "" : ` with ${JSON.stringify(event.detail)}`}.` +
            `${declared?.description ? ` (${declared.description})` : ""}`,
        );
      }
      if (request) parts.push(`Request: ${request}`);
      return parts.join("\n\n");
    },
  };
}

/** Every element tag in a tree, root first. */
export function tagsIn(tree: Tree): string[] {
  return [tree.tag, ...(tree.children ?? []).flatMap(tagsIn)];
}
