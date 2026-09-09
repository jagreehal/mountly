---
"mountly-vite-plugin": minor
---

Add `shadow: true` to `defineElementsConfig`. Every element in the distribution
then renders into its own shadow root: the build emits one stylesheet that it
injects into no document, and each element adopts it into its own root. The
host's CSS stays out of the component, and the component's CSS stays out of the
host's document. Light DOM remains the default, since the usual consumer is a
page whose design system should reach in.
