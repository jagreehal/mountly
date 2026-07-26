---
"mountly-vite-plugin": patch
---

`mountlyHostPlugin` now applies Vite's `base` to the import map it injects.

Import maps are resolved against the document, not the bundler, so a host deployed under a sub-path — GitHub Pages, a reverse proxy, anything that isn't the server root — emitted remote URLs like `/remote/dist/Badge.js` that resolved against the origin root and 404'd. Every remote failed to load.

Production builds now prefix site-relative import-map URLs with the resolved `base`. Absolute (`https:`), protocol-relative (`//`) and `data:` URLs are left untouched, and a root base (`/`) is a no-op, so nothing changes for hosts served from the root. Dev is unaffected — it already resolved through `devOrigins`.
