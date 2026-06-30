#!/usr/bin/env node
// Regenerates schema.json from the zod schema so the JSON Schema never drifts.
// Runs after tsup build (see package.json "build").
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestJsonSchema } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "schema.json");

const schema = manifestJsonSchema();
schema.$id = "https://mountly.dev/schema/manifest.schema.json";
schema.title = "Mountly Manifest";

writeFileSync(out, `${JSON.stringify(schema, null, 2)}\n`);
process.stdout.write(`schema.json regenerated at ${out}\n`);
