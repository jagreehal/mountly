import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * The vocabulary the model may compose into a UI. `createJsonRenderMcpApp`
 * turns this one object into both halves of the tool contract:
 *
 * - `catalog.zodSchema()` becomes the tool's `spec` input schema, so a host
 *   rejects a spec that uses a component this catalog never declared;
 * - `catalog.prompt()` becomes the tool description, so the model is told the
 *   component names, their props, and the authoring rules without any
 *   hand-written prompt.
 *
 * The matching React components live in `registry.tsx`. Keep the two in step:
 * a component declared here with no implementation there renders as nothing.
 */
export const catalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({ gap: z.number().optional() }),
      slots: ["default"],
      description: "Vertical stack of children with an optional gap (px).",
    },
    Row: {
      props: z.object({ gap: z.number().optional() }),
      slots: ["default"],
      description: "Horizontal row. Use for a line of Cards side by side.",
    },
    Card: {
      props: z.object({ title: z.string().optional() }),
      slots: ["default"],
      description: "A titled container for a group of related elements.",
    },
    Heading: {
      props: z.object({ text: z.string() }),
      description: "A section heading. One near the top of a view.",
    },
    Text: {
      props: z.object({ text: z.string(), muted: z.boolean().optional() }),
      description: "A line of body text. `muted: true` for secondary captions.",
    },
    Stat: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        delta: z.string().optional(),
      }),
      description: "A KPI: a label, a big value, and an optional delta like '+12%'.",
    },
  },
  actions: {},
});
