---
"mountly-mcp": minor
---

Make the json-render MCP integration wire-compatible with `@json-render/mcp`, and bump `@json-render/core`/`@json-render/react` to 0.20.

The json-render tool previously advertised an empty input schema
(`{"type":"object","properties":{}}`) and a one-line description, so the catalog
was decorative — the model was told nothing about the components it could use.

- The tool now takes a single `spec` argument typed from `catalog.zodSchema()`,
  matching `@json-render/mcp`. (The schema must be a Zod _raw shape_; passing a
  bare `ZodType` is what produced the empty schema.)
- The tool description now carries `catalog.prompt()`.
- Tool results carry the spec in both wire formats: as JSON in
  `content[0].text` (what `@json-render/mcp`'s iframe hook reads) and as
  `structuredContent.spec` (what Mountly's hosts read). `useJsonRenderApp`
  reads either, so an iframe built against either package renders a server
  built with the other.
- Input accepts the strict catalog schema **or** a looser spec shape. Core
  still marks `children` required on every element, which would otherwise
  reject common first-attempt model output at the SDK gate before the handler
  could repair it.

**Breaking:** `REQUIRED_FIELDS_RULE` and `pruneDanglingChildren` are removed
from `mountly-mcp/json-render/server`. Both were ports of unreleased upstream
fixes and are redundant in `@json-render/core` 0.20 — the catalog prompt now
carries the required-`children` rule verbatim, and `autoFixSpec` prunes
dangling child references itself, including the repeat-container edge case.
Callers using them directly can drop the calls; `streamSpec` is unaffected.
