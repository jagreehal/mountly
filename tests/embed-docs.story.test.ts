import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { extractDocs } from "../packages/mountly-vite-plugin/src/docs";

describe("Component docs", () => {
  it("reads the JSDoc and the written types a catalog reader needs", ({ task }) => {
    story.init(task);
    story.given("a component with JSDoc on itself and its props, and a literal union");

    const docs = extractDocs(`
      interface Props {
        /** Customer id, e.g. \`cus_1\`. */
        customerId: string;
        /**
         * Which invoices to show.
         * @default "all"
         */
        status?: "paid" | "overdue" | "all";
        count: number;
      }
      /** A customer’s invoices, newest first. */
      export default function InvoiceList(props: Props) { return null; }
    `);

    story.then("descriptions drop JSDoc tags, and types keep their literal values");
    expect(docs).toEqual({
      description: "A customer’s invoices, newest first.",
      props: {
        customerId: {
          description: "Customer id, e.g. `cus_1`.",
          type: "string",
          schema: { type: "string" },
        },
        status: {
          description: "Which invoices to show.",
          type: '"paid" | "overdue" | "all"',
          schema: { type: "string", enum: ["paid", "overdue", "all"] },
        },
        count: { type: "number", schema: { type: "number" } },
      },
    });
  });

  it("derives a JSON Schema per prop, with constraints from JSDoc tags", ({ task }) => {
    story.init(task);
    story.given("nested objects, arrays, records, a function, and @minimum / @slot tags");

    const docs = extractDocs(`
      type Line = { label: string; /** Pence. @minimum 0 */ amount: number };
      interface Props {
        /** How many. @minimum 1 @maximum 20 */
        limit?: number;
        lines: Line[];
        flags?: Record<string, boolean>;
        mode: "a" | 1;
        onPick?: (id: string) => void;
      }
      /**
       * A card.
       * @slot - The body.
       * @slot actions - Buttons along the bottom.
       */
      export default function Card(props: Props) { return null; }
    `);

    story.then("each type becomes the schema a validator or constrained decoder can use");
    expect(docs.props.limit?.schema).toEqual({ type: "number", minimum: 1, maximum: 20 });
    expect(docs.props.limit?.description).toBe("How many.");
    expect(docs.props.lines?.schema).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          amount: { type: "number", minimum: 0, description: "Pence." },
        },
        required: ["label", "amount"],
        additionalProperties: false,
      },
    });
    expect(docs.props.flags?.schema).toEqual({
      type: "object",
      additionalProperties: { type: "boolean" },
    });
    expect(docs.props.mode?.schema).toEqual({ enum: ["a", 1] });
    expect(docs.props.onPick?.schema).toBeUndefined();

    story.then("@slot tags name the component's slots, the unnamed one first");
    expect(docs.slots).toEqual([
      { name: "", description: "The body." },
      { name: "actions", description: "Buttons along the bottom." },
    ]);
  });

  it("finds the comment on named exports and Vue/Svelte props", ({ task }) => {
    story.init(task);

    expect(
      extractDocs(`/** Named. */\nexport const Card = (p: { /** A */ a: number }) => null;`, {
        exportName: "Card",
      }),
    ).toEqual({
      description: "Named.",
      props: { a: { description: "A", type: "number", schema: { type: "number" } } },
    });
    expect(
      extractDocs(
        `<script setup lang="ts">defineProps<{ /** Label */ label: string }>()</script>`,
        { file: "C.vue" },
      ).props,
    ).toEqual({ label: { description: "Label", type: "string", schema: { type: "string" } } });
    expect(
      extractDocs(
        `<script lang="ts">let { size }: { /** Px */ size: number } = $props();</script>`,
        { file: "C.svelte" },
      ).props,
    ).toEqual({ size: { description: "Px", type: "number", schema: { type: "number" } } });
    story.then("an undocumented component yields nothing rather than an error");
    expect(extractDocs(`export default function C() { return null; }`)).toEqual({ props: {} });
  });

  it("reads the component description on Vue and Svelte SFCs", ({ task }) => {
    story.init(task);
    story.given("JSDoc before defineProps / $props, or an HTML comment before <script>");

    expect(
      extractDocs(
        `<script setup lang="ts">
          /** A customer's invoices. */
          defineProps<{ label: string }>()
        </script>`,
        { file: "InvoiceList.vue" },
      ).description,
    ).toBe("A customer's invoices.");
    expect(
      extractDocs(
        `<!-- Balance for the signed-in customer. -->
        <script setup lang="ts">defineProps<{ balance: number }>()</script>`,
        { file: "Balance.vue" },
      ).description,
    ).toBe("Balance for the signed-in customer.");
    // A template comment earlier in the file is not part of the description.
    expect(
      extractDocs(
        `<template><!-- icon --><div /></template>
        <!-- Balance for the signed-in customer. -->
        <script setup lang="ts">defineProps<{ balance: number }>()</script>`,
        { file: "Balance.vue" },
      ).description,
    ).toBe("Balance for the signed-in customer.");
    expect(
      extractDocs(
        `<script lang="ts">
          /** Start a return for a delivered order. */
          let { orderId }: { orderId: string } = $props();
        </script>`,
        { file: "ReturnForm.svelte" },
      ).description,
    ).toBe("Start a return for a delivered order.");
    expect(
      extractDocs(
        `<!-- Contact options for support. -->
        <script lang="ts">let { phone }: { phone: string } = $props();</script>`,
        { file: "Contact.svelte" },
      ).description,
    ).toBe("Contact options for support.");
  });

  it("returns empty docs when the source cannot be parsed", ({ task }) => {
    story.init(task);
    story.then("unreadable input is absent, never an error");
    expect(extractDocs(`<<< not typescript`, { file: "Broken.tsx" })).toEqual({ props: {} });
    expect(extractDocs(`<script setup lang="ts">defineProps<{`, { file: "Broken.vue" })).toEqual({
      props: {},
    });
  });
});
