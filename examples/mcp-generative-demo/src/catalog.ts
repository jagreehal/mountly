import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * The declarative vocabulary an agent composes into a UI. Richer than a toy
 * dashboard — enough range that a model can assemble something genuinely
 * good-looking, while every type stays constrained + typed.
 *
 * The matching native components live in `registry.tsx`; the agent emits a
 * JSON spec using only these types, streamed in via json-render's compiler.
 */
export const catalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({ gap: z.number().optional() }),
      slots: ["default"],
      description: "Vertical stack of children with an optional gap (px).",
    },
    Row: {
      props: z.object({
        gap: z.number().optional(),
        wrap: z.boolean().optional(),
      }),
      slots: ["default"],
      description:
        "Horizontal row of children that lays them out side by side. Use for a grid of Cards or Stats.",
    },
    Card: {
      props: z.object({
        title: z.string().optional(),
        accent: z.boolean().optional(),
      }),
      slots: ["default"],
      description:
        "A titled container. Set `accent: true` for one emphasized hero card per view (sparingly).",
    },
    Heading: {
      props: z.object({ text: z.string() }),
      description: "A section heading. One near the top of a view.",
    },
    Text: {
      props: z.object({
        text: z.string(),
        muted: z.boolean().optional(),
      }),
      description: "A line of body text. `muted: true` for secondary captions.",
    },
    Stat: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        trend: z.enum(["up", "down", "flat"]).optional(),
        delta: z.string().optional(),
      }),
      description:
        "A KPI: label + big value, optional trend (up=good green, down=bad red) with a delta like '+12%'.",
    },
    Badge: {
      props: z.object({
        text: z.string(),
        tone: z.enum(["neutral", "positive", "warning", "danger"]).optional(),
      }),
      description: "A small status pill, e.g. 'Live', 'Degraded', 'Paid'.",
    },
    Sparkline: {
      props: z.object({
        points: z.array(z.number()),
        tone: z.enum(["accent", "positive", "danger"]).optional(),
      }),
      description:
        "A tiny inline area chart from a number[] series. Use inside a Card to show a trend.",
    },
    Divider: {
      props: z.object({}),
      description: "A thin horizontal rule between sections.",
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "ghost"]).optional(),
      }),
      description:
        "A button. Bind its `on.press` (or `on.click`) event to the `ask` action to talk back to the agent, e.g. `on.press = { action: 'ask', params: { prompt: '<the next question to send the agent>' } }`. Always include a non-empty `prompt`. Use these to let the user drill deeper — each click drives the agent to generate the next view.",
    },
  },
  actions: {
    // The agent loop. json-render resolves an element's `on.press`/`on.click`
    // binding and fires the renderer's `onAction`; the widget routes `ask` to
    // the MCP host via `App.sendMessage`, sending a follow-up turn to the
    // model — which generates the next view. This is the self-driving loop.
    ask: {
      params: z.object({ prompt: z.string() }),
      description:
        "Send a follow-up message to the agent, driving it to generate the next view.",
    },
  },
});
