# mountly-manifest

The manifest is the contract between a host page and the widgets it loads. It
says which verticals exist, where their code lives, and which single copy of
React (or Vue, or Svelte) they all share.

```bash
pnpm add mountly-manifest
```

## The problem it solves

Several teams ship widgets independently. The host page has to load them
without shipping three copies of React, and without the host repo knowing
anything about a team's build. A manifest is the seam:

```json
{
  "version": "2",
  "platform": { "imports": { "react": "https://cdn.example.com/react@19.js" } },
  "verticals": [
    {
      "id": "billing",
      "url": "https://cdn.example.com/billing/peer.js",
      "exports": { "./Checkout": "./Checkout.js" }
    }
  ]
}
```

Teams publish a fragment from their own build. The host merges the fragments
and turns the result into an import map, so the browser loads one React and
every widget resolves against it.

## Reading a manifest

```ts
import { parseManifest, validateManifest, manifestToImportMap } from "mountly-manifest";

const manifest = parseManifest(JSON.parse(await readFile("manifest.json", "utf8")));

// Duplicate React, version skew, unreachable URLs — before the browser finds out.
const issues = validateManifest(manifest);
if (issues.some((issue) => issue.level === "error")) throw new Error("bad manifest");

const imports = manifestToImportMap(manifest);
```

`parseManifest` validates against the published Zod schema and throws on a
malformed document, so everything downstream can trust the shape. Manifest v1
is not accepted — `"version"` must be `"2"`.

## Composing fragments

Each vertical's build emits `mountly.manifest.fragment.json` (see
[`mountly-vite-plugin`](https://npmjs.com/package/mountly-vite-plugin)). CI
merges them into the manifest the host serves:

```ts
import { composeManifestFromFragments } from "mountly-manifest";

const { manifest } = composeManifestFromFragments({
  root: process.cwd(),
  fragments: ["packages/billing/dist/mountly.manifest.fragment.json"],
  platform: { imports: { react: "https://cdn.example.com/react@19.js" } },
});
```

This is what keeps teams independent: nobody edits a shared file, and a
vertical that hasn't rebuilt keeps its last known-good entry.

## Serving it

`mountly-manifest/server` renders the import map into the document head, which
must happen before any module script runs:

```ts
import { renderMountlyHead, createManifestResponse } from "mountly-manifest/server";

// In your SSR template
const head = renderMountlyHead(manifest);

// Or serve the manifest itself, with caching headers
export function GET() {
  return createManifestResponse(manifest);
}
```

## Typed remotes

`codegenManifestTypes` turns the manifest's `types` block into ambient
declarations, so a host importing `billing/Checkout` gets real types for a
module it never compiled:

```ts
import { codegenManifestTypes } from "mountly-manifest";

await writeFile("src/mountly-remotes.d.ts", codegenManifestTypes(manifest));
```

The `types` block is filled in for you by `mountlyManifestFragmentPlugin`,
which asks the TypeScript checker what each entry exports.

## Exports

| Import                         | Contains                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| `mountly-manifest`             | parse, validate, compose, codegen, import-map helpers           |
| `mountly-manifest/server`      | `renderMountlyHead`, `createManifestResponse`, `mergeManifests` |
| `mountly-manifest/client`      | browser-side vertical loading                                   |
| `mountly-manifest/schema.json` | the JSON Schema, for editor completion and CI validation        |

Point your manifest at the schema for completion in editors:

```json
{ "$schema": "https://mountly.dev/schema/manifest.schema.json", "version": "2" }
```

## Documentation

<https://mountly.dev/concepts/manifest-hosts/>

## License

Apache-2.0
