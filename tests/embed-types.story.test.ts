import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { embedTypes } from "../packages/mountly-vite-plugin/src/types";

describe("embed.d.ts types", () => {
  it("keeps written types that can come along, and copies the local types they name", ({
    task,
  }) => {
    story.init(task);
    story.given("props typed inline, by local types, a package, a namespace and a type parameter");

    const code = `
      import type { Theme } from "design-system";
      type Line = { label: string; children?: Line[] };
      interface Tagged extends Base { tag: "a" | "Line" }
      interface Base { id: string }
      enum Status { Paid }
      interface Props<T> {
        loadCatalogue?: (type: "works" | "tracks") => Promise<{ title: string }[]>;
        lines: Line[];
        tagged: Tagged;
        theme: Theme;
        status: Status;
        icon?: React.ReactNode;
        pick: (item: T) => void;
        onSelect?: (line: Line) => void;
        onClose?: () => void;
      }
      export default function Card<T>(props: Props<T>) { return null; }
    `;
    const types = embedTypes(code, { scope: "AcmeCard" });

    story.then("self-contained types survive, local names renamed into the element's scope");
    expect(types.props).toEqual({
      loadCatalogue: '(type: "works" | "tracks") => Promise<{ title: string }[]>',
      lines: "AcmeCard_Line[]",
      tagged: "AcmeCard_Tagged",
    });
    expect(types.declarations.sort()).toEqual([
      "export interface AcmeCard_Base { id: string }",
      'export interface AcmeCard_Tagged extends AcmeCard_Base { tag: "a" | "Line" }',
      "export type AcmeCard_Line = { label: string; children?: AcmeCard_Line[] };",
    ]);

    story.then("an event's detail is its callback's first argument");
    expect(types.events).toEqual({ select: "AcmeCard_Line" });
  });

  it("follows relative imports and re-exports", ({ task }) => {
    story.init(task);
    story.given("a props type naming types from sibling files, one through a barrel");

    const files: Record<string, string> = {
      "/src/money.ts": `export interface Money { amount: number; currency: Currency }\ntype Currency = "GBP" | "USD";`,
      "/src/types/index.ts": `export { Row as Line } from "../row.js";`,
      "/src/row.ts": `import type { Money } from "./money.js";\nexport type Row = { label: string; total: Money };`,
      "/src/legacy.ts": `export type Legacy = import("./money").Money;`,
      "/src/opaque.ts": `export class Opaque {}`,
    };
    const code = `
      import type { Money } from "./money";
      import type { Line } from "./types";
      import type { Opaque } from "./opaque";
      import type { Legacy } from "./legacy";
      export default function Card(props: { total: Money; line: Line; other: Opaque; old: Legacy }) {
        return null;
      }
    `;
    const types = embedTypes(code, {
      file: "/src/Card.tsx",
      scope: "AcmeCard",
      load: (file) => files[file],
    });

    story.then("imported types are copied; ones that cannot be leave the prop untyped");
    expect(types.props).toEqual({ total: "AcmeCard_Money", line: "AcmeCard_Row" });
    expect(types.declarations.sort()).toEqual([
      "export interface AcmeCard_Money { amount: number; currency: AcmeCard_Currency }",
      'export type AcmeCard_Currency = "GBP" | "USD";',
      "export type AcmeCard_Row = { label: string; total: AcmeCard_Money };",
    ]);
  });

  it("keeps a name only when the consumer has it too", ({ task }) => {
    story.init(task);
    story.given("names a consumer has, and names only the author's build sees");
    const code = `
      interface Opt { a: number }
      interface Opt { b: number }
      export default function Card(props: {
        el: HTMLElement;
        when: Date;
        file: Blob;
        picked: Partial<Record<string, number>>;
        merged: Opt;
        bytes: Buffer;
        item: Item;
      }) {
        type Item = { id: string };
        return null;
      }
    `;
    const types = embedTypes(code, { scope: "C" });

    story.then(
      "DOM, ECMAScript and utility types stay; merged, Node-only and local names fall back",
    );
    expect(types.props).toEqual({
      el: "HTMLElement",
      when: "Date",
      file: "Blob",
      picked: "Partial<Record<string, number>>",
    });
    expect(types.declarations).toEqual([]);
  });

  it("types Vue emits from either defineEmits spelling", ({ task }) => {
    story.init(task);
    const tuple = `<script setup lang="ts">
      defineProps<{ label: string }>();
      defineEmits<{ "view-details": [id: string]; close: [] }>();
    </script>`;
    const call = `<script setup lang="ts">
      defineEmits<{ (e: "view-details", id: number): void }>();
    </script>`;
    expect(embedTypes(tuple, { file: "Panel.vue", scope: "P" })).toEqual({
      props: { label: "string" },
      events: { "view-details": "string" },
      declarations: [],
    });
    expect(embedTypes(call, { file: "Panel.vue", scope: "P" }).events).toEqual({
      "view-details": "number",
    });

    story.then("an optional element is optional, and a rest element is no single detail");
    const shapes = `<script setup lang="ts">
      defineEmits<{ a: [string?]; b: [id?: number]; c: [...ids: string[]]; d: [...string[]] }>();
    </script>`;
    expect(embedTypes(shapes, { file: "Panel.vue", scope: "P" }).events).toEqual({
      a: "string | null",
      b: "number | null",
    });
  });
});
