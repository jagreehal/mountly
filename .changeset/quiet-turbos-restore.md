---
"mountly": patch
---

Fix a CI failure that only appeared on a turbo cache hit.

`mountlyHostPlugin` writes its ambient remote declarations to `src/mountly-remotes.d.ts`, which is gitignored — but that path was not in turbo's `build` outputs, so a cache hit skipped the build without restoring the file. Type-aware lint then failed on any host example that imports a remote by bare specifier (`Cannot find module 'demo-widget'`), on a clean checkout that had done nothing wrong.

The generated declarations are now declared build outputs, so a cached build restores them.
