import { globSync, readFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { parseAst, type Plugin, type Rollup, type UserConfig } from "vite";
import type { MountlyWidgetFramework } from "./index.js";
import { extractProps, kebab, type PropSpec } from "./props.js";

export interface MountlyElementEntry {
  /** Browser-compatible component source, also importable directly by your app. */
  component: string;
  exportName?: string;
  /**
   * Override the adapter for this element. Inferred from the file extension, so
   * this is only for a component whose extension does not say what it is — a
   * Vue `defineComponent` written in a `.ts` file, say.
   */
  framework?: MountlyWidgetFramework;
  /** Override the prop table when the component's props type lives elsewhere. */
  props?: PropSpec[];
  /** Core trigger syntax. Defaults to mounting when connected. */
  trigger?: string;
}

export interface MountlyElementsConfigOptions {
  /**
   * Namespace for the generated tags. Custom element names need a dash, and
   * the consumer's page is not yours — `acme` gives `<acme-payments-summary>`.
   */
  prefix: string;
  /** A glob of component files, or an explicit tag → component map. */
  elements: string | string[] | Record<string, string | MountlyElementEntry>;
  /**
   * Project root. Only needed when the config is not loaded from it — a
   * monorepo running the build from elsewhere, say. Defaults to `process.cwd()`.
   */
  root?: string;
  /**
   * Render every element into a shadow root instead of the host's light DOM.
   *
   * Light DOM is the default because the usual consumer is a page that wants
   * its own design system to reach in — a CMS template, a partner site running
   * your tokens. Turn this on when the host is one you do not trust to leave
   * your component alone, or that you must not affect: the host's CSS cannot
   * reach in, and your CSS stops being emitted into its document.
   *
   * The whole distribution shares the setting, because it describes the kind
   * of host you ship to, not the component.
   */
  shadow?: boolean;
}

interface BuiltElement {
  tag: string;
  entry: MountlyElementEntry;
  props: PropSpec[];
  framework: MountlyWidgetFramework;
}

/** The file says which framework it is, so nobody has to repeat it in config. */
function frameworkFor(file: string): MountlyWidgetFramework {
  if (file.endsWith(".vue")) return "vue";
  if (file.endsWith(".svelte")) return "svelte";
  return "react";
}

const TS_TYPE: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  json: "unknown",
  auto: "unknown",
  function: "(...args: never[]) => unknown",
};

/** `src/PaymentsSummary.tsx` → `acme-payments-summary`. */
function tagFor(file: string, prefix: string): string {
  return `${prefix}-${kebab(basename(file, extname(file)))}`;
}

function normalize(
  options: MountlyElementsConfigOptions,
  root: string,
): Array<[string, MountlyElementEntry]> {
  const prefix = kebab(options.prefix);
  const seen = new Set<string>();
  const unique = (entries: Array<[string, MountlyElementEntry]>) => {
    for (const [tag, entry] of entries) {
      if (seen.has(tag)) {
        throw new Error(`[mountly] two components both map to <${tag}>: ${entry.component}`);
      }
      seen.add(tag);
    }
    return entries;
  };
  if (typeof options.elements === "string" || Array.isArray(options.elements)) {
    const patterns = [options.elements].flat();
    const files = patterns.flatMap((pattern) => globSync(pattern, { cwd: root }).sort());
    if (!files.length) {
      throw new Error(`[mountly] no components matched ${patterns.join(", ")}`);
    }
    return unique(files.map((file) => [tagFor(file, prefix), { component: file }]));
  }
  const entries = Object.entries(options.elements).map(
    ([name, entry]) =>
      [
        // The namespace is the point of `prefix`, so it always applies. Naming a
        // key that already carries it is allowed, and means the same tag.
        name.startsWith(`${prefix}-`) ? name : `${prefix}-${kebab(name)}`,
        typeof entry === "string" ? { component: entry } : entry,
      ] as [string, MountlyElementEntry],
  );
  if (!entries.length) throw new Error("[mountly] elements must contain at least one component");
  return unique(entries);
}

/** Types the consumer gets for free: typed tags in JSX and in plain DOM code. */
function declarations(elements: BuiltElement[]): string {
  const blocks = elements.map(({ tag, props }) => {
    const id = name(tag);
    const members = props
      .filter((spec) => spec.kind !== "event")
      // `aria-label` is a valid prop name but not a valid identifier.
      .map((spec) => `  ${member(spec.name)}?: ${TS_TYPE[spec.kind] ?? "unknown"};`);
    const events = props
      .filter((spec) => spec.kind === "event")
      .map((spec) => `  ${JSON.stringify(spec.event)}: CustomEvent;`);
    const block = (kind: string, lines: string[]) =>
      lines.length
        ? `export interface ${id}${kind} {\n${lines.join("\n")}\n}`
        : `export interface ${id}${kind} {}`;
    return `${block("Props", members)}

${block("EventMap", events)}

export interface ${id}Element extends MountlyElement<${id}Props> {
  addEventListener<K extends keyof ${id}EventMap>(
    type: K,
    listener: (this: ${id}Element, event: ${id}EventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: ${id}Element, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
}`;
  });

  const tagMap = elements.map(({ tag }) => `    ${JSON.stringify(tag)}: ${name(tag)}Element;`);
  const jsx = elements.map(
    ({ tag }) =>
      `      ${JSON.stringify(tag)}: ${name(tag)}Props & { children?: unknown; class?: string; id?: string };`,
  );

  return `// Generated by mountly-vite-plugin. Do not edit.
// Self-contained: a consumer with only the script tag needs no package installed.

type MountlyElement<Props> = HTMLElement &
  Partial<Props> & {
    /** Retry a failed load, or mount before the configured trigger. */
    mount(): Promise<void>;
  };

${blocks.join("\n\n")}

declare global {
  interface HTMLElementTagNameMap {
${tagMap.join("\n")}
  }
  // The global JSX namespace, which Preact, Solid and Vue JSX read.
  namespace JSX {
    interface IntrinsicElements {
${jsx.join("\n")}
    }
  }
}
`;
}

/**
 * React 19 resolves `JSX` from the `react` module rather than the global
 * namespace, so a React host needs its own augmentation. Kept in a separate
 * file: declaring the `react` module inside the main one would invent that
 * module for every consumer who does not have React.
 */
function reactDeclarations(elements: BuiltElement[]): string {
  const jsx = elements.map(
    ({ tag }) =>
      `      ${JSON.stringify(tag)}: ${name(tag)}Props & { children?: React.ReactNode; class?: string; id?: string; ref?: React.Ref<HTMLElement> };`,
  );
  const imports = elements.map(({ tag }) => `${name(tag)}Props`).join(", ");
  return `// Generated by mountly-vite-plugin. Do not edit.
// Reference this file instead of embed.d.ts in a React host.
/// <reference path="./embed.d.ts" />
import type * as React from "react";
import type { ${imports} } from "./embed.js";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
${jsx.join("\n")}
    }
  }
}
`;
}

/** A TypeScript member name, quoted when it is not a bare identifier. */
function member(prop: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(prop) ? prop : JSON.stringify(prop);
}

function name(tag: string): string {
  return tag.replace(/(^|-)([a-z])/g, (_m, _d, char: string) => char.toUpperCase());
}

/** The Custom Elements Manifest — what editors read for HTML autocomplete. */
function manifest(elements: BuiltElement[]): string {
  return JSON.stringify(
    {
      schemaVersion: "1.0.0",
      readme: "",
      modules: elements.map(({ tag, entry, props }) => ({
        kind: "javascript-module",
        path: entry.component,
        declarations: [
          {
            kind: "class",
            name: name(tag),
            customElement: true,
            tagName: tag,
            members: props
              .filter((spec) => spec.kind !== "event")
              .map((spec) => ({
                kind: "field",
                name: spec.name,
                type: { text: TS_TYPE[spec.kind] ?? "unknown" },
              })),
            attributes: props
              .filter((spec) => spec.attribute)
              .map((spec) => ({
                name: spec.attribute,
                fieldName: spec.name,
                type: { text: TS_TYPE[spec.kind] ?? "unknown" },
              })),
            events: props
              .filter((spec) => spec.kind === "event")
              .map((spec) => ({ name: spec.event, type: { text: "CustomEvent" } })),
          },
        ],
        exports: [
          {
            kind: "custom-element-definition",
            name: tag,
            declaration: { name: name(tag), module: entry.component },
          },
        ],
      })),
    },
    null,
    2,
  );
}

/** The compiler plugin each framework needs, and how to spot one already there. */
const FRAMEWORK_PLUGIN: Partial<
  Record<MountlyWidgetFramework, { prefix: string; module: string; load: () => Promise<Plugin[]> }>
> = {
  vue: {
    prefix: "vite:vue",
    module: "@vitejs/plugin-vue",
    load: async () => [(await import("@vitejs/plugin-vue")).default()].flat() as Plugin[],
  },
  svelte: {
    prefix: "vite-plugin-svelte",
    module: "@sveltejs/vite-plugin-svelte",
    load: async () => [(await import("@sveltejs/vite-plugin-svelte")).svelte()].flat() as Plugin[],
  },
  // React needs none: `oxc.jsx` below already transforms JSX.
};

/**
 * A `.vue` or `.svelte` file needs its compiler. We already know which
 * frameworks are in play, so asking the author to name them again in a
 * `plugins` array is a step that only exists to be forgotten.
 */
async function frameworkPlugins(frameworks: Set<MountlyWidgetFramework>): Promise<Plugin[]> {
  const added: Plugin[] = [];
  for (const framework of frameworks) {
    const entry = FRAMEWORK_PLUGIN[framework];
    if (!entry) continue;
    try {
      added.push(...(await entry.load()));
    } catch {
      throw new Error(
        `[mountly] ${framework} components need ${entry.module}. ` +
          `Install it, or add your own compiler plugin to the config.`,
      );
    }
  }
  return added;
}

/**
 * Two copies of a framework compiler is not a warning-level problem: the second
 * one receives the first one's output and fails somewhere unhelpful. Say so
 * here, where the cause is still obvious.
 */
function assertSingleCompiler(plugins: readonly { name: string }[] = []): void {
  for (const entry of Object.values(FRAMEWORK_PLUGIN)) {
    const count = plugins.filter((plugin) => plugin?.name === entry.prefix).length;
    if (count > 1) {
      throw new Error(
        `[mountly] ${entry.module} is registered ${count} times. ` +
          `defineElementsConfig adds it for you — remove it from your own plugins array.`,
      );
    }
  }
}

/**
 * Stands in for the stylesheet's URL until the bundle is assembled and its
 * hashed name is known. A string literal, so a minifier carries it through
 * untouched.
 */
const CSS_TOKEN = "__MOUNTLY_EMBED_CSS__";

/**
 * Point each shadow widget at the stylesheet the build just emitted.
 *
 * Shadow mode turns off CSS code splitting, so Vite writes one stylesheet and
 * injects it into no document, which is the point. Each widget takes its URL
 * and the adapter adopts it into that element's shadow root instead.
 *
 * This edits the finished chunk, so its sourcemap shifts by the length of one
 * URL. Only shadow builds carry the token. Emit the URL from `renderChunk`
 * with a proper mapping if that offset ever matters.
 */
function resolveCssToken(bundle: Rollup.OutputBundle): void {
  const stylesheet = Object.keys(bundle).find((file) => file.endsWith(".css"));
  const token = new RegExp(`(["'\`])${CSS_TOKEN}\\1`, "g");
  for (const output of Object.values(bundle)) {
    if (output.type !== "chunk" || !output.code.includes(CSS_TOKEN)) continue;
    // No stylesheet in the whole distribution means no component imported CSS.
    if (!stylesheet) {
      output.code = output.code.replace(token, "void 0");
      continue;
    }
    const href = relative(dirname(output.fileName), stylesheet).replace(/\\/g, "/");
    output.code = output.code.replace(
      token,
      `new URL(${JSON.stringify(`./${href}`)}, import.meta.url).href`,
    );
  }
}

/**
 * `new Worker(url)` throws when `url` is on another origin, as it is for every
 * worker in a distribution served from a CDN to someone else's page. A module
 * or classic script on a blob: URL is same-origin by definition, so it can
 * import the real worker (CORS on the assets is already required). Same-origin
 * workers are constructed untouched. Declared on the chunk's first line so the
 * sourcemap shifts only there.
 */
const WORKER_SHIM =
  "function __mountlyWorker(u,o){var h=String(u);" +
  "if(new URL(h,location.href).origin===location.origin)return new Worker(u,o);" +
  'var s=o&&o.type==="module"?"import "+JSON.stringify(h)+";":"importScripts("+JSON.stringify(h)+");";' +
  'return new Worker(URL.createObjectURL(new Blob([s],{type:"text/javascript"})),o)}';

// oxc's ESTree nodes, loosely typed the same way props.ts reads them.
type Node = Record<string, any>;

const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
// Where a `var` stops hoisting: a function, or a class's `static { }` block.
const VAR_SCOPES = new Set([...FUNCTIONS, "StaticBlock"]);

/** The names a pattern binds: `{ Worker: W }` binds `W`, never the key `Worker`. */
function patternNames(pattern: Node | null | undefined): string[] {
  if (!pattern) return [];
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((p: Node) =>
        patternNames(p.type === "RestElement" ? p.argument : p.value),
      );
    case "ArrayPattern":
      return pattern.elements.flatMap(patternNames);
    case "RestElement":
      return patternNames(pattern.argument);
    case "AssignmentPattern":
      return patternNames(pattern.left);
    default:
      return [];
  }
}

/** Child nodes, in source order. */
function children(node: Node): Node[] {
  const out: Node[] = [];
  for (const key in node) {
    if (key === "parent") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === "string") out.push(item);
    } else if (value && typeof value.type === "string") out.push(value);
  }
  return out;
}

/** `var`s hoist to the nearest function or static block; collect without entering inner ones. */
function varNames(node: Node): string[] {
  if (VAR_SCOPES.has(node.type)) return [];
  const own =
    node.type === "VariableDeclaration" && node.kind === "var"
      ? node.declarations.flatMap((d: Node) => patternNames(d.id))
      : [];
  return [...own, ...children(node).flatMap(varNames)];
}

/** What a statement list declares for its block: let, const, class, function, import. */
function lexicalNames(statements: Node[]): string[] {
  return statements.flatMap((statement: Node): string[] => {
    const declared =
      statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;
    if (!declared) return [];
    switch (declared.type) {
      case "VariableDeclaration":
        return declared.kind === "var"
          ? []
          : declared.declarations.flatMap((d: Node) => patternNames(d.id));
      case "FunctionDeclaration":
      case "ClassDeclaration":
        return declared.id ? [declared.id.name] : [];
      case "ImportDeclaration":
        return declared.specifiers.map((spec: Node) => spec.local.name);
      default:
        return [];
    }
  });
}

/** The bindings a node introduces for its own subtree, or null if it opens no scope. */
function scopeOf(node: Node, parent: Node | undefined): string[] | null {
  switch (node.type) {
    case "Program":
      return [...lexicalNames(node.body), ...varNames({ type: "Block", body: node.body })];
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      // Parameters only. Their defaults run in this scope, before the body's
      // declarations exist, so `(w = new Worker(u)) => { const Worker = … }`
      // still means the platform's Worker in the default.
      return [
        ...node.params.flatMap(patternNames),
        // A named function expression sees its own name.
        ...(node.type === "FunctionExpression" && node.id ? [node.id.name] : []),
      ];
    case "BlockStatement":
      // A function's body block also holds that function's hoisted vars.
      return FUNCTIONS.has(parent?.type) && parent?.body === node
        ? [...lexicalNames(node.body), ...node.body.flatMap(varNames)]
        : lexicalNames(node.body);
    case "StaticBlock":
      return [...lexicalNames(node.body), ...node.body.flatMap(varNames)];
    case "SwitchStatement":
      // The cases' scope. The discriminant is outside it: see `walk`.
      return lexicalNames(node.cases.flatMap((c: Node) => c.consequent));
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement": {
      const head = node.type === "ForStatement" ? node.init : node.left;
      return head?.type === "VariableDeclaration" && head.kind !== "var"
        ? head.declarations.flatMap((d: Node) => patternNames(d.id))
        : [];
    }
    case "CatchClause":
      return patternNames(node.param);
    case "ClassExpression":
      return node.id ? [node.id.name] : [];
    default:
      return null;
  }
}

/**
 * Route each `new Worker(…)` that means the platform's Worker through the
 * cross-origin shim. Parsed, not pattern-matched: the same characters in a
 * string, template or comment are content, and an inline worker's source is one
 * of those strings. A call is left alone when any enclosing scope binds
 * `Worker` (a parameter, a catch, a var, a let, a class, an import), since that
 * call constructs the author's Worker.
 */
export function shimWorkers(code: string): string | null {
  if (!code.includes("Worker")) return null;
  const callees: Array<{ start: number; end: number }> = [];
  const walk = (node: Node, parent: Node | undefined, shadowed: boolean) => {
    const scope = scopeOf(node, parent);
    const hidden = shadowed || Boolean(scope?.includes("Worker"));
    if (
      !hidden &&
      node.type === "NewExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "Worker"
    ) {
      callees.push(node.callee);
    }
    for (const child of children(node)) {
      // `switch (x)` evaluates x before its cases' block exists, so a
      // `const Worker` in a case cannot shadow a Worker in the discriminant.
      const outside = node.type === "SwitchStatement" && child === node.discriminant;
      walk(child, node, outside ? shadowed : hidden);
    }
  };
  walk(parseAst(code, { lang: "js" }), undefined, false);
  if (!callees.length) return null;
  let out = code;
  // Right to left, so earlier offsets stay valid.
  for (const { start, end } of callees.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, start) + "__mountlyWorker" + out.slice(end);
  }
  return WORKER_SHIM + out;
}

/**
 * An element whose props could not be read would ignore everything the consumer
 * sets, and say so nowhere. Fail the build instead, and name the way out.
 */
function readPropTable(entry: MountlyElementEntry, tag: string, root: string): PropSpec[] {
  const file = resolve(root, entry.component);
  const props = extractProps(readFileSync(file, "utf8"), {
    file,
    exportName: entry.exportName,
  });
  if (!props) {
    throw new Error(
      `[mountly] cannot read the props of ${entry.component} for <${tag}>. ` +
        `Declare the props type in that file, or pass \`props\` on the element entry.`,
    );
  }
  return props;
}

/**
 * Build a script-tag distribution: one file registers every tag, and each
 * component, its framework and its CSS arrive only when an element connects.
 *
 * The author writes an ordinary React/Vue/Svelte component. Its props type is
 * read at build time, so the consumer gets real attributes, real properties and
 * real DOM events with nothing to configure on either side.
 */
export function defineElementsConfig(options: MountlyElementsConfigOptions): UserConfig {
  const entryId = "virtual:mountly-embed";
  const widgetPrefix = "virtual:mountly-widget/";
  const shadow = options.shadow === true;
  let elements: BuiltElement[] = [];
  // Vite resolves its plugin list before any hook runs, so the frameworks in
  // play have to be known now. Globbing is cheap; the prop tables still wait
  // until `configResolved`, when root is final.
  let root = options.root ?? process.cwd();
  const frameworks = new Set(
    normalize(options, root).map(([, entry]) => entry.framework ?? frameworkFor(entry.component)),
  );

  const plugin: Plugin = {
    name: "mountly:elements",
    configResolved(config) {
      root = config.root;
      assertSingleCompiler(config.plugins);
      elements = normalize(options, root).map(([tag, entry]) => ({
        tag,
        entry,
        props: entry.props ?? readPropTable(entry, tag, root),
        framework: entry.framework ?? frameworkFor(entry.component),
      }));
    },
    resolveId(id) {
      if (id === entryId || id.startsWith(widgetPrefix)) return `\0${id}`;
    },
    load(id) {
      if (id === `\0${entryId}`) {
        const definitions = elements.map(
          ({ tag, entry, props }) => `${JSON.stringify(tag)}: {
    load: () => import(${JSON.stringify(widgetPrefix + tag)}),
    props: ${JSON.stringify(props)},
    trigger: ${JSON.stringify(entry.trigger ?? "connected")}
  }`,
        );
        return `import { defineElements } from "mountly/embed";
defineElements({
  ${definitions.join(",\n  ")}
});`;
      }
      if (id.startsWith(`\0${widgetPrefix}`)) {
        const tag = id.slice(widgetPrefix.length + 1);
        const element = elements.find((candidate) => candidate.tag === tag);
        if (!element) return;
        const path = resolve(root, element.entry.component).replace(/\\/g, "/");
        // The stylesheet's hashed name is not known until the bundle is
        // assembled, so leave a token here and fill it in from `generateBundle`.
        const widgetOptions = shadow
          ? `, { shadow: true, cssUrl: ${JSON.stringify(CSS_TOKEN)} }`
          : "";
        return `import * as component from ${JSON.stringify(path)};
import { createWidget } from ${JSON.stringify(`mountly-${element.framework}`)};
export default createWidget(component[${JSON.stringify(element.entry.exportName ?? "default")}]${widgetOptions});`;
      }
    },
    // Vite has already rewritten `new Worker(new URL(…))` to the emitted file by
    // now, so only the constructor call needs rerouting.
    renderChunk(code) {
      const shimmed = shimWorkers(code);
      return shimmed ? { code: shimmed, map: null } : null;
    },
    // Vite writes the stylesheet from its own `generateBundle`, so the name to
    // point at only exists once every other plugin has had its turn.
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        if (shadow) resolveCssToken(bundle);
        this.emitFile({ type: "asset", fileName: "embed.d.ts", source: declarations(elements) });
        this.emitFile({
          type: "asset",
          fileName: "embed.react.d.ts",
          source: reactDeclarations(elements),
        });
        this.emitFile({
          type: "asset",
          fileName: "custom-elements.json",
          source: manifest(
            elements.map((element) => ({
              ...element,
              entry: {
                ...element.entry,
                component: relative(root, resolve(root, element.entry.component)),
              },
            })),
          ),
        });
      },
    },
  };

  return {
    ...(options.root ? { root: options.root } : {}),
    // Vite's application pipeline already handles lazy CSS, asset rebasing,
    // and shared framework chunks. A library build would make us recreate it.
    base: "./",
    // Only enable the JSX transform when React is in play: it would otherwise
    // try to parse a `.vue` or `.svelte` file before its compiler sees it.
    oxc: frameworks.has("react") ? { jsx: { runtime: "automatic" } } : undefined,
    plugins: [plugin, frameworkPlugins(frameworks)],
    // ES workers keep their own `import.meta.url` when the shim imports them
    // from a blob:, so their relative URLs still resolve against the provider.
    // Classic (iife) workers would see the blob's URL instead.
    worker: { format: "es" },
    build: {
      sourcemap: true,
      // Light DOM wants Vite's per-chunk stylesheets, which arrive with the
      // component that needs them. Shadow roots need the opposite: one
      // stylesheet nothing injects, which each element adopts for itself.
      cssCodeSplit: !shadow,
      rollupOptions: {
        input: entryId,
        output: { entryFileNames: "embed.js", chunkFileNames: "assets/[name]-[hash].js" },
      },
    },
  };
}
