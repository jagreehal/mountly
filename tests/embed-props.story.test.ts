import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { extractProps, eventName, kebab } from "../packages/mountly-vite-plugin/src/props";
import { mergeConfig } from "vite";
import { defineElementsConfig } from "../packages/mountly-vite-plugin/src/embed";

const table = (code: string, exportName?: string, file?: string) =>
  Object.fromEntries((extractProps(code, { exportName, file }) ?? []).map((p) => [p.name, p.kind]));

describe("Prop table extraction", () => {
  it("reads types from an interface so attributes coerce without configuration", ({ task }) => {
    story.init(task);
    story.given("a component whose props are a local interface");

    const props = extractProps(`
      interface Props {
        balance: number;
        currency: string;
        dark?: boolean;
        lineItems: Array<{ id: string }>;
        onViewDetails?: (detail: { id: string }) => void;
      }
      export default function PaymentsSummary(props: Props) { return null; }
    `);

    story.then("each prop carries its wire format and its attribute name");
    expect(props).toEqual([
      { name: "balance", attribute: "balance", kind: "number" },
      { name: "currency", attribute: "currency", kind: "string" },
      { name: "dark", attribute: "dark", kind: "boolean" },
      { name: "lineItems", attribute: "line-items", kind: "json" },
      { name: "onViewDetails", kind: "event", event: "view-details" },
    ]);
  });

  it("handles the shapes people actually write components in", ({ task }) => {
    story.init(task);
    story.given("destructured params, type aliases, inline literals, FC and named exports");

    expect(table(`type P = { a: number }; export default function C({ a }: P) {}`)).toEqual({
      a: "number",
    });
    expect(table(`export default function C(p: { a: string; onGo?: () => void }) {}`)).toEqual({
      a: "string",
      onGo: "event",
    });
    expect(
      table(`
        import type { FC } from "react";
        interface P { a: boolean }
        const C: FC<P> = () => null;
        export default C;
      `),
    ).toEqual({ a: "boolean" });
    expect(table(`interface P { a: string } export default (p: P) => null;`)).toEqual({
      a: "string",
    });
    expect(table(`type P = { a: number }; export function Widget(p: P) {}`, "Widget")).toEqual({
      a: "number",
    });
    expect(table(`export interface P { a: number } export default function C(p: P) {}`)).toEqual({
      a: "number",
    });
  });

  it("keeps optional and literal unions on the wire format they really use", ({ task }) => {
    story.init(task);
    story.given("props typed as unions");

    expect(
      table(`
        interface P {
          size: "sm" | "lg";
          count: number | undefined;
          flag: boolean | null;
          mixed: string | number;
        }
        export default function C(p: P) {}
      `),
    ).toEqual({ size: "string", count: "number", flag: "boolean", mixed: "json" });
  });

  it("falls back to destructured names when a component carries no types", ({ task }) => {
    story.init(task);
    story.given("a plain JavaScript component");

    expect(table(`export default function C({ balance, onGo }) {}`)).toEqual({
      balance: "auto",
      onGo: "event",
    });

    story.then("a component that takes no props at all reports an empty table");
    expect(extractProps(`export default function C() {}`)).toEqual([]);

    story.then("but props it cannot read report null, so the build can refuse to ship");
    expect(extractProps(`export default 42;`)).toBeNull();
    expect(extractProps(`export default function C(props) {}`)).toBeNull();
    expect(
      extractProps(`import type { P } from "./elsewhere"; export default function C(p: P) {}`),
    ).toBeNull();
  });

  it("carries inherited and intersected props through, or refuses", ({ task }) => {
    story.init(task);
    story.given("props assembled from a base interface, as component libraries do");

    expect(
      table(`
        interface Base { balance: number; currency: string }
        interface Props extends Base { compact?: boolean }
        export default function C(p: Props) {}
      `),
    ).toEqual({ balance: "number", currency: "string", compact: "boolean" });

    expect(
      table(`
        type Base = { balance: number };
        type Props = Base & { label: string };
        export default function C(p: Props) {}
      `),
    ).toEqual({ balance: "number", label: "string" });

    story.then("a base it cannot see would drop props silently, so it refuses");
    expect(
      extractProps(`
        import type { Base } from "./base";
        interface Props extends Base { compact?: boolean }
        export default function C(p: Props) {}
      `),
    ).toBeNull();
  });

  it("resolves local type aliases so a string stays a string", ({ task }) => {
    story.init(task);
    story.given("props typed through local aliases rather than primitives");

    expect(
      table(`
        type Currency = string;
        type Amount = number;
        interface Props { currency: Currency; balance: Amount; rows: Array<{ id: string }> }
        export default function C(p: Props) {}
      `),
      // `currency="GBP"` must not be parsed as JSON, which would throw.
    ).toEqual({ currency: "string", balance: "number", rows: "json" });

    story.then("an alias it cannot resolve guesses from the literal instead of assuming JSON");
    expect(
      table(`
        import type { Currency } from "./money";
        interface Props { currency: Currency }
        export default function C(p: Props) {}
      `),
    ).toEqual({ currency: "auto" });
  });

  it("sees through memo and forwardRef, and refuses wrappers it cannot", ({ task }) => {
    story.init(task);
    story.given("the wrappers React components are routinely declared with");

    const P = "interface Props { balance: number; onGo?: () => void } ";
    expect(table(P + `const C = memo(function Inner(p: Props) {}); export default C;`)).toEqual({
      balance: "number",
      onGo: "event",
    });
    expect(table(P + `const C = forwardRef((p: Props, ref) => null); export default C;`)).toEqual({
      balance: "number",
      onGo: "event",
    });
    expect(table(P + `const C = memo<Props>(() => null); export default C;`)).toEqual({
      balance: "number",
      onGo: "event",
    });

    story.then("an opaque wrapper reports null rather than an empty prop table");
    expect(extractProps(`const C = styled.div\`color: red\`; export default C;`)).toBeNull();
  });

  it("treats literal types as the primitive they are", ({ task }) => {
    story.init(task);
    story.given("props narrowed to literals, which is how variants are typed");

    expect(
      table(`
        type Size = "sm";
        interface Props { kind: "card"; size: Size; level: 1; on: true }
        export default function C(p: Props) {}
      `),
      // `kind="card"` is a string attribute; parsing it as JSON would throw.
    ).toEqual({ kind: "string", size: "string", level: "number", on: "boolean" });
  });

  it("keeps quoted prop names, which is how accessibility props are written", ({ task }) => {
    story.init(task);

    expect(
      extractProps(`
        interface Props { 'aria-label': string; 'data-id'?: number; label: string }
        export default function C(p: Props) {}
      `),
    ).toEqual([
      { name: "aria-label", attribute: "aria-label", kind: "string" },
      { name: "data-id", attribute: "data-id", kind: "number" },
      { name: "label", attribute: "label", kind: "string" },
    ]);
  });

  it("reads callbacks declared with method syntax", ({ task }) => {
    story.init(task);
    story.given("`onSave(value: string): void`, which many libraries prefer");

    expect(
      extractProps(`
        interface Props {
          label: string;
          onSave(value: string): void;
          onCancel?(): void;
        }
        export default function C(p: Props) {}
      `),
    ).toEqual([
      { name: "label", attribute: "label", kind: "string" },
      { name: "onSave", kind: "event", event: "save" },
      { name: "onCancel", kind: "event", event: "cancel" },
    ]);
  });

  it("never lets a destructuring pattern stand in for a type it could not read", ({ task }) => {
    story.init(task);
    story.given("a component destructuring some props out of an unresolvable type");

    // Reading the pattern would publish `currency` and silently drop the rest.
    expect(
      extractProps(`
        import type { Props } from "./props";
        export default function C({ currency, ...rest }: Props) {}
      `),
    ).toBeNull();

    expect(
      extractProps(`
        import type { Base } from "./base";
        interface Props extends Base { currency: string }
        export default function C({ currency }: Props) {}
      `),
    ).toBeNull();

    story.then("a genuinely untyped component still falls back to its pattern");
    expect(table(`export default function C({ currency, onGo }) {}`)).toEqual({
      currency: "auto",
      onGo: "event",
    });
  });

  it("derives attribute and event names by convention", ({ task }) => {
    story.init(task);
    expect(kebab("lineItems")).toBe("line-items");
    expect(kebab("ariaLabel2")).toBe("aria-label2");
    expect(eventName("onViewDetails")).toBe("view-details");
    expect(eventName("onGo")).toBe("go");
  });
});

describe("Vue and Svelte components", () => {
  it("reads a Vue SFC's defineProps and defineEmits", ({ task }) => {
    story.init(task);
    story.given('an ordinary <script setup lang="ts"> single-file component');

    const props = extractProps(
      `<template><section>{{ balance }}</section></template>
       <script setup lang="ts">
       interface Props { balance: number; currency: string; compact?: boolean }
       defineProps<Props>();
       const emit = defineEmits<{ (e: 'view-details', payload: { balance: number }): void }>();
       </script>`,
      { file: "src/elements/PaymentsSummary.vue" },
    );

    story.then("props keep their types and each emit becomes a DOM event");
    expect(props).toEqual([
      { name: "balance", attribute: "balance", kind: "number" },
      { name: "currency", attribute: "currency", kind: "string" },
      { name: "compact", attribute: "compact", kind: "boolean" },
      // Vue delivers `emit('view-details')` by calling the `onViewDetails` prop.
      { name: "onViewDetails", kind: "event", event: "view-details" },
    ]);
  });

  it("accepts the newer defineEmits object spelling", ({ task }) => {
    story.init(task);
    const props = extractProps(
      `<script setup lang="ts">
       defineProps<{ label: string }>();
       defineEmits<{ 'pick-method': [string]; 'view-details': [] }>();
       </script>`,
      { file: "Card.vue" },
    );
    expect(props).toEqual([
      { name: "label", attribute: "label", kind: "string" },
      { name: "onPickMethod", kind: "event", event: "pick-method" },
      { name: "onViewDetails", kind: "event", event: "view-details" },
    ]);
  });

  it("reads a Svelte 5 component's $props rune", ({ task }) => {
    story.init(task);
    story.given("`let { … }: Props = $props()`, the ordinary Svelte 5 spelling");

    const props = extractProps(
      `<script lang="ts">
       interface Props { balance: number; currency: string; onViewDetails?: (d: unknown) => void }
       let { balance, currency, onViewDetails }: Props = $props();
       </script>
       <section>{balance}</section>`,
      { file: "src/elements/PaymentsSummary.svelte" },
    );

    expect(props).toEqual([
      { name: "balance", attribute: "balance", kind: "number" },
      { name: "currency", attribute: "currency", kind: "string" },
      { name: "onViewDetails", kind: "event", event: "view-details" },
    ]);
  });

  it("reads withDefaults and the runtime array emits spelling", ({ task }) => {
    story.init(task);
    story.given("the spellings a Vue component with defaults actually uses");

    expect(
      extractProps(
        `<script setup lang="ts">
         interface Props { balance: number; currency: string }
         withDefaults(defineProps<Props>(), { currency: "GBP" });
         defineEmits(['view-details', 'pick-method']);
         </script>`,
        { file: "C.vue" },
      ),
    ).toEqual([
      { name: "balance", attribute: "balance", kind: "number" },
      { name: "currency", attribute: "currency", kind: "string" },
      { name: "onViewDetails", kind: "event", event: "view-details" },
      { name: "onPickMethod", kind: "event", event: "pick-method" },
    ]);
  });

  it("never ships half a Vue contract", ({ task }) => {
    story.init(task);
    story.given("one half of the declaration readable and the other not");

    // Typed emits but runtime props: the data props would vanish.
    expect(
      extractProps(
        `<script setup lang="ts">
         defineProps({ balance: Number });
         defineEmits<{ 'pick': [] }>();
         </script>`,
        { file: "C.vue" },
      ),
    ).toBeNull();

    // Emits declared through a variable: the event would vanish.
    expect(
      extractProps(
        `<script setup lang="ts">
         defineProps<{ label: string }>();
         defineEmits(EVENTS);
         </script>`,
        { file: "C.vue" },
      ),
    ).toBeNull();
  });

  it("reads a Vue Options API component's props and emits", ({ task }) => {
    story.init(task);
    story.given("the runtime declaration style, with and without defineComponent");

    expect(
      extractProps(
        `<script lang="ts">
         export default {
           props: { balance: Number, label: String, compact: Boolean, rows: Array },
           emits: ['view-details'],
         };
         </script>`,
        { file: "C.vue" },
      ),
    ).toEqual([
      { name: "balance", attribute: "balance", kind: "number" },
      { name: "label", attribute: "label", kind: "string" },
      { name: "compact", attribute: "compact", kind: "boolean" },
      { name: "rows", attribute: "rows", kind: "json" },
      { name: "onViewDetails", kind: "event", event: "view-details" },
    ]);

    expect(
      extractProps(
        `<script lang="ts">
         export default defineComponent({
           props: { balance: { type: Number, required: true } },
           emits: ['save'],
         });
         </script>`,
        { file: "C.vue" },
      ),
    ).toEqual([
      { name: "balance", attribute: "balance", kind: "number" },
      { name: "onSave", kind: "event", event: "save" },
    ]);

    story.then("the untyped array spelling still yields the prop names");
    expect(
      extractProps(`<script>export default { props: ['balance'] };</script>`, { file: "C.vue" }),
    ).toEqual([{ name: "balance", attribute: "balance", kind: "auto" }]);

    story.then("props behind a variable are unreadable, so the build refuses");
    expect(
      extractProps(`<script>export default { props: SHARED_PROPS };</script>`, { file: "C.vue" }),
    ).toBeNull();
  });

  it("refuses a Vue component that composes options it cannot see", ({ task }) => {
    story.init(task);
    story.given("mixins, extends and spreads, which all carry props of their own");

    const vue = (body: string) =>
      extractProps(`<script>export default ${body};</script>`, { file: "C.vue" });

    // Each of these would publish only `label` and drop the inherited half.
    expect(vue(`{ mixins: [base], props: { label: String } }`)).toBeNull();
    expect(vue(`{ extends: Base, props: { label: String } }`)).toBeNull();
    expect(vue(`{ ...options, props: { label: String } }`)).toBeNull();
    expect(
      extractProps(
        `<script>export default defineComponent({ mixins: [base], emits: ['go'] });</script>`,
        { file: "C.vue" },
      ),
    ).toBeNull();

    story.then("a self-contained component is still read as before");
    expect(vue(`{ props: { label: String } }`)).toEqual([
      { name: "label", attribute: "label", kind: "string" },
    ]);
  });

  it("refuses a Svelte component whose declared props type is unreadable", ({ task }) => {
    story.init(task);
    expect(
      extractProps(
        `<script lang="ts">
         import type { Props } from "./props";
         let { balance }: Props = $props();
         </script>`,
        { file: "C.svelte" },
      ),
    ).toBeNull();
  });

  it("refuses SFCs whose props it cannot read, rather than shipping them propless", ({ task }) => {
    story.init(task);

    // Vue's runtime `defineProps({ … })` spelling carries no types to read.
    expect(
      extractProps(`<script setup>defineProps({ balance: Number });</script>`, { file: "C.vue" }),
    ).toBeNull();
    // A Svelte component that never calls $props().
    expect(extractProps(`<script>let x = 1;</script><p>hi</p>`, { file: "C.svelte" })).toBeNull();
    // But a Svelte component with no types still yields its destructured names.
    expect(
      extractProps(`<script>let { balance, onGo } = $props();</script>`, { file: "C.svelte" }),
    ).toEqual([
      { name: "balance", attribute: "balance", kind: "auto" },
      { name: "onGo", kind: "event", event: "go" },
    ]);
  });
});

describe("Element discovery", () => {
  const fixture = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "mountly-elements-"));
    for (const [name, source] of Object.entries(files)) {
      mkdirSync(join(dir, dirname(name)), { recursive: true });
      writeFileSync(join(dir, name), source);
    }
    return dir;
  };

  /** Run the plugin's build-time analysis without a full Vite build. */
  const resolve = (dir: string, options: Parameters<typeof defineElementsConfig>[0]) => {
    const config = defineElementsConfig({ ...options, root: dir }) as unknown as {
      plugins: Array<{
        configResolved: (config: { root: string }) => void;
        load: (id: string) => string | undefined;
      }>;
    };
    const plugin = config.plugins[0]!;
    plugin.configResolved({ root: dir });
    return plugin.load("\0virtual:mountly-embed")!;
  };

  /** The lazy chunk for one tag, which is where the adapter choice shows up. */
  const widgetModule = (
    dir: string,
    options: Parameters<typeof defineElementsConfig>[0],
    tag: string,
  ) => {
    const config = defineElementsConfig({ ...options, root: dir }) as unknown as {
      plugins: Array<{
        configResolved: (config: { root: string }) => void;
        load: (id: string) => string | undefined;
      }>;
    };
    const plugin = config.plugins[0]!;
    plugin.configResolved({ root: dir });
    return plugin.load(`\0virtual:mountly-widget/${tag}`)!;
  };

  const CARD = `
    interface Props { balance: number; onPick?: () => void }
    export default function Card(props: Props) { return null; }
  `;

  it("turns a directory of components into namespaced tags", ({ task }) => {
    story.init(task);
    story.given("two components in one directory and only a prefix in the config");

    const dir = fixture({
      "src/elements/PaymentsSummary.tsx": CARD,
      "src/elements/PaymentMethods.tsx": "export default function M() { return null; }",
    });
    const entry = resolve(dir, { prefix: "acme", elements: "src/elements/*.tsx" });

    story.then("each file becomes a tag, with its prop table baked in");
    expect(entry).toContain('"acme-payments-summary"');
    expect(entry).toContain('"acme-payment-methods"');
    expect(entry).toContain('"attribute":"balance","kind":"number"');
    expect(entry).toContain('"kind":"event","event":"pick"');
    // Registration must not pull the components in.
    expect(entry).toContain("import(");
    expect(entry).not.toContain("PaymentsSummary.tsx");
  });

  it("publishes a component library that lives in one barrel file", ({ task }) => {
    story.init(task);
    story.given("one module exporting several named components, as a library does");

    const dir = fixture({
      "src/index.tsx": `
        export interface CardProps { balance: number; onPick?: () => void }
        export function PaymentsCard(props: CardProps) { return null; }

        export interface PanelProps { label: string; open?: boolean }
        export function MethodsPanel(props: PanelProps) { return null; }
      `,
    });
    const entry = resolve(dir, {
      prefix: "acme",
      elements: {
        "payments-card": { component: "src/index.tsx", exportName: "PaymentsCard" },
        "methods-panel": { component: "src/index.tsx", exportName: "MethodsPanel" },
      },
    });

    story.then("each named export becomes its own tag with its own prop table");
    expect(entry).toContain('"acme-payments-card"');
    expect(entry).toContain('"acme-methods-panel"');
    expect(entry).toContain('"attribute":"balance","kind":"number"');
    expect(entry).toContain('"attribute":"label","kind":"string"');
    expect(entry).toContain('"attribute":"open","kind":"boolean"');
    expect(entry).toContain('"event":"pick"');
  });

  /** The compilers the returned config brings with it. */
  const compilers = async (dir: string, elements: string) => {
    const config = defineElementsConfig({ prefix: "acme", elements, root: dir }) as unknown as {
      plugins: Array<Promise<Array<{ name: string }>> | { name: string }>;
    };
    const resolved = await Promise.all(config.plugins);
    return resolved.flat().map((p) => p.name);
  };

  it("brings the compiler its components need, without being told", async ({ task }) => {
    story.init(task);
    story.given("a Vue and a Svelte component, and a config that mentions neither compiler");

    const dir = fixture({
      "src/elements/Panel.vue": `<script setup lang="ts">defineProps<{ label: string }>();</script>`,
      "src/elements/List.svelte": `<script lang="ts">let { rows }: { rows: number } = $props();</script>`,
    });
    const names = await compilers(dir, "src/elements/*.{vue,svelte}");

    story.then("both compilers are in the config it returns");
    expect(names).toContain("vite:vue");
    expect(names.some((name) => name.startsWith("vite-plugin-svelte"))).toBe(true);
  });

  it("adds no compiler a React build does not need", async ({ task }) => {
    story.init(task);

    const dir = fixture({ "src/elements/Card.tsx": CARD });
    const names = await compilers(dir, "src/elements/*.tsx");
    expect(names).toEqual(["mountly:elements"]);
  });

  it("refuses a second copy of a compiler rather than transforming twice", async ({ task }) => {
    story.init(task);
    story.given("an author who also added the Vue plugin by hand");

    const dir = fixture({
      "src/elements/Panel.vue": `<script setup lang="ts">defineProps<{ label: string }>();</script>`,
    });
    const config = defineElementsConfig({
      prefix: "acme",
      elements: "src/elements/*.vue",
      root: dir,
    }) as unknown as {
      plugins: Array<Promise<Array<{ name: string }>> | { configResolved?: (c: unknown) => void }>;
    };
    const mountlyPlugin = config.plugins[0] as {
      configResolved: (config: { root: string; plugins: Array<{ name: string }> }) => void;
    };

    expect(() =>
      mountlyPlugin.configResolved({
        root: dir,
        plugins: [{ name: "vite:vue" }, { name: "vite:vue" }],
      }),
    ).toThrow(/registered 2 times/);
  });

  it("keeps its defaults while letting the config be overridden", ({ task }) => {
    story.init(task);
    story.given("a build that wants a different outDir and its own framework plugin");

    const base = defineElementsConfig({
      prefix: "acme",
      elements: { card: "src/a.tsx" },
    });
    const merged = mergeConfig(base, {
      build: { outDir: "release" },
      plugins: [{ name: "vite:vue" }],
    });

    story.then("the override wins and none of the defaults are lost");
    expect(merged.build?.outDir).toBe("release");
    expect(merged.build?.cssCodeSplit).toBe(true);
    expect(merged.build?.rollupOptions?.output).toMatchObject({ entryFileNames: "embed.js" });
    expect(merged.base).toBe("./");
    return Promise.all(merged.plugins as unknown[]).then((resolved) => {
      expect(resolved.flat().map((p) => (p as { name: string }).name)).toEqual([
        "mountly:elements",
        "vite:vue",
      ]);
    });
  });

  it("refuses to publish an element whose props it cannot read", ({ task }) => {
    story.init(task);
    story.given("a component whose props type lives in another module");

    const dir = fixture({
      "src/elements/Card.tsx": `
        import type { Props } from "./types";
        export default function Card(props: Props) { return null; }
      `,
    });

    story.then("the build fails, naming the file and the way out");
    expect(() => resolve(dir, { prefix: "acme", elements: "src/elements/*.tsx" })).toThrow(
      /cannot read the props of .*Card\.tsx.*<acme-card>/s,
    );

    story.then("an explicit prop table is that way out");
    const entry = resolve(dir, {
      prefix: "acme",
      elements: {
        card: {
          component: "src/elements/Card.tsx",
          props: [{ name: "seats", attribute: "seats", kind: "number" }],
        },
      },
    });
    expect(entry).toContain('"attribute":"seats","kind":"number"');
  });

  it("discovers Vue and Svelte components the same way as React ones", ({ task }) => {
    story.init(task);
    story.given("one directory holding a .tsx, a .vue and a .svelte component");

    const dir = fixture({
      "src/elements/PaymentsCard.tsx": CARD,
      "src/elements/MethodsPanel.vue": `<script setup lang="ts">
        defineProps<{ label: string; count: number }>();
        defineEmits<{ 'pick-method': [string] }>();
        </script>`,
      "src/elements/HistoryList.svelte": `<script lang="ts">
        interface Props { rows: number; onOpen?: () => void }
        let { rows, onOpen }: Props = $props();
        </script>`,
    });
    const entry = resolve(dir, { prefix: "acme", elements: "src/elements/*.{tsx,vue,svelte}" });

    story.then("each becomes a tag with its own prop table, whatever the dialect");
    expect(entry).toContain('"acme-payments-card"');
    expect(entry).toContain('"acme-methods-panel"');
    expect(entry).toContain('"acme-history-list"');
    expect(entry).toContain('"attribute":"label","kind":"string"');
    expect(entry).toContain('"attribute":"count","kind":"number"');
    expect(entry).toContain('"event":"pick-method"');
    expect(entry).toContain('"attribute":"rows","kind":"number"');
    expect(entry).toContain('"event":"open"');
  });

  it("takes the framework from the file, and lets one distribution mix them", ({ task }) => {
    story.init(task);
    story.given("a React, a Vue and a Svelte component with no framework configured");

    const dir = fixture({
      "src/elements/PaymentsCard.tsx": CARD,
      "src/elements/MethodsPanel.vue": `<script setup lang="ts">defineProps<{ label: string }>();</script>`,
      "src/elements/HistoryList.svelte": `<script lang="ts">let { rows }: { rows: number } = $props();</script>`,
    });
    const options = { prefix: "acme", elements: "src/elements/*.{tsx,vue,svelte}" };

    story.then("each element pulls its own adapter, in the same build");
    expect(widgetModule(dir, options, "acme-payments-card")).toContain('from "mountly-react"');
    expect(widgetModule(dir, options, "acme-methods-panel")).toContain('from "mountly-vue"');
    expect(widgetModule(dir, options, "acme-history-list")).toContain('from "mountly-svelte"');
  });

  it("lets an entry override the framework its extension implies", ({ task }) => {
    story.init(task);
    story.given("a Vue component authored in a .ts file, which the extension cannot reveal");

    const dir = fixture({ "src/Card.ts": "export default {};" });
    const options = {
      prefix: "acme",
      elements: {
        card: {
          component: "src/Card.ts",
          framework: "vue" as const,
          props: [{ name: "label", attribute: "label", kind: "string" as const }],
        },
      },
    };
    expect(widgetModule(dir, options, "acme-card")).toContain('from "mountly-vue"');
  });

  it("catches collisions and empty globs before the browser does", ({ task }) => {
    story.init(task);

    const clash = fixture({
      "src/a/Card.tsx": CARD,
      "src/b/Card.tsx": CARD,
    });
    expect(() => resolve(clash, { prefix: "acme", elements: "src/*/Card.tsx" })).toThrow(
      /both map to <acme-card>/,
    );

    const empty = fixture({ "src/elements/Card.tsx": CARD });
    expect(() => resolve(empty, { prefix: "acme", elements: "src/nothing/*.tsx" })).toThrow(
      /no components matched/,
    );
  });
});
