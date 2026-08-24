---
"mountly": patch
"mountly-mcp": minor
---

Documentation accuracy pass, and golden-path DX for MCP Apps.

`mountly`: the core entry is 2.3 KB gzipped, not the ~9 KB carried over from the
previous runtime. API stability described a pre-1.0 package and froze a `0.6.x`
line; it now states the 1.0 surface and its semver commitment. References to the
`mountly-tsrx` adapter are gone, and React version claims say React 19 to match
the adapter's declared peer.

`mountly-mcp`: new `doctor` and `add` commands, `vanilla` listed in `--help`, and
failures that carry a stable `mountly-mcp/...` code plus a `Next:` line naming
the command or file to open. Scaffolds ship `serve-stdio.mjs` and resolve
`dist/mountly-mcp.manifest.json` from the server module rather than the working
directory, which an MCP host chooses for you. Docs gain a host matrix, a Mountly
vs ext-apps page, canonical examples, and a `GLOSSARY.md` that the skills,
templates, and docs are tested against.
