# mountly-tailwind

Tailwind v4 design preset for [mountly](https://npmjs.com/package/mountly) widgets.

## Install

```bash
pnpm add -D mountly-tailwind tailwindcss
```

## Use in a widget

In your widget's CSS entry:

```css
@import "mountly-tailwind";
@source "./";

:host {
  padding: 1rem;
}
```

That's it. You now have:

- Tailwind utility classes
- A shared color/spacing/font palette via `--color-ui-*`, `--radius-ui`, `--font-ui-*`
- Host-overridable CSS custom properties on the shadow root (`--ui-surface`, `--ui-text`, etc.)

## Override tokens from the host page

```html
<div data-mountly-mount style="--ui-accent: oklch(0.5 0.2 280);"></div>
```
