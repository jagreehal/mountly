// Pure Vue 3 UI library. Knows nothing about mountly. Equally usable in a
// Nuxt app, a Vite + Vue SPA, or anywhere Vue renders. Defines components
// with the functional/render-function form so the fixture doesn't need an
// SFC compiler — in a real package these would be `.vue` files.
import { h, defineComponent } from "https://esm.sh/vue@3.5.13";

export const Button = defineComponent({
  name: "UiButton",
  props: {
    variant: { type: String, default: "default" },
  },
  emits: ["click"],
  setup(props, { slots, emit, attrs }) {
    return () =>
      h(
        "button",
        {
          ...attrs,
          class: ["ui-btn", `ui-btn-${props.variant}`],
          onClick: (e) => emit("click", e),
        },
        slots.default ? slots.default() : null,
      );
  },
});

export const Card = defineComponent({
  name: "UiCard",
  props: {
    tone: { type: String, default: "neutral" },
    title: { type: String, default: "" },
  },
  setup(props, { slots }) {
    return () =>
      h(
        "section",
        { class: ["ui-card", `ui-card-${props.tone}`] },
        [
          props.title ? h("h3", { class: "ui-card-title" }, props.title) : null,
          h("div", { class: "ui-card-body" }, slots.default ? slots.default() : []),
        ],
      );
  },
});

export const Stack = defineComponent({
  name: "UiStack",
  props: { gap: { type: Number, default: 8 } },
  setup(props, { slots }) {
    return () =>
      h(
        "div",
        {
          class: "ui-stack",
          style: { display: "flex", flexDirection: "column", gap: `${props.gap}px` },
        },
        slots.default ? slots.default() : [],
      );
  },
});

export const __ui_id = "pure-vue-ui-lib@1.0.0";
