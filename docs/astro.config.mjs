import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const BASE_PATH = "/mountly";

export default defineConfig({
  site: "https://jagreehal.github.io",
  base: BASE_PATH,
  integrations: [
    starlight({
      title: "mountly",
      description:
        "On-demand interactive UI platform — load rich UI only when the user actually needs it.",
      logo: {
        src: "./public/logo.svg",
        replacesTitle: false,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/jagreehal/mountly",
        },
      ],
      customCss: ["./src/styles/theme.css"],
      head: [
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#1d1815" },
        },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: "",
          },
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Introduction", slug: "getting-started/introduction" },
            { label: "Quick start", slug: "getting-started/quick-start" },
            { label: "How it works", slug: "getting-started/how-it-works" },
            { label: "Installation", slug: "getting-started/installation" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Components, widgets, features", slug: "concepts/vocabulary" },
            { label: "Triggers", slug: "concepts/triggers" },
            { label: "Lifecycle", slug: "concepts/lifecycle" },
            { label: "Styling", slug: "concepts/styling" },
            { label: "Multi-widget bundles", slug: "concepts/multi-widget" },
            { label: "Caching", slug: "concepts/caching" },
            { label: "Distribution", slug: "concepts/distribution" },
            { label: "Custom element", slug: "concepts/custom-element" },
            { label: "Predictive prefetch", slug: "concepts/prefetch" },
            { label: "Devtools panel", slug: "concepts/devtools" },
            { label: "When not to use mountly", slug: "concepts/when-not-to-use" },
          ],
        },
        {
          label: "Frameworks",
          items: [
            { label: "React", slug: "frameworks/react" },
            { label: "Vue", slug: "frameworks/vue" },
            { label: "Svelte", slug: "frameworks/svelte" },
            { label: "TSRX", slug: "frameworks/tsrx" },
            { label: "Plain HTML", slug: "frameworks/plain-html" },
            { label: "Tailwind", slug: "frameworks/tailwind" },
          ],
        },
        {
          label: "API reference",
          items: [
            { label: "createOnDemandFeature", slug: "api/create-on-demand-feature" },
            { label: "createWidget", slug: "api/create-widget" },
            { label: "installRuntime", slug: "api/install-runtime" },
            { label: "Custom element", slug: "api/custom-element" },
            { label: "Trigger plugins", slug: "api/trigger-plugins" },
            { label: "Data source", slug: "api/data-source" },
            { label: "URL state", slug: "api/url-state" },
            { label: "Event bus", slug: "api/event-bus" },
            { label: "Test helpers", slug: "api/test-helpers" },
            { label: "Analytics", slug: "api/analytics" },
          ],
        },
        {
          label: "Evidence",
          items: [{ label: "Screenshots", slug: "evidence/screenshots" }],
        },
      ],
    }),
  ],
});
