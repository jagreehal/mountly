import { globSync, readFileSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import type { Plugin, UserConfig } from "vite";
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
              .filter((spec) => spec.kind !== "event")
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
  let elements: BuiltElement[] = [];
  let root = process.cwd();

  const plugin: Plugin = {
    name: "mountly:elements",
    configResolved(config) {
      root = config.root;
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
        return `import * as component from ${JSON.stringify(path)};
import { createWidget } from ${JSON.stringify(`mountly-${element.framework}`)};
export default createWidget(component[${JSON.stringify(element.entry.exportName ?? "default")}]);`;
      }
    },
    generateBundle() {
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
  };

  return {
    // Vite's application pipeline already handles lazy CSS, asset rebasing,
    // and shared framework chunks. A library build would make us recreate it.
    base: "./",
    // Only React components need the JSX transform, but one distribution may
    // legitimately hold components from more than one framework.
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [plugin],
    build: {
      sourcemap: true,
      cssCodeSplit: true,
      rollupOptions: {
        input: entryId,
        output: { entryFileNames: "embed.js", chunkFileNames: "assets/[name]-[hash].js" },
      },
    },
  };
}
