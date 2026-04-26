#!/usr/bin/env node
import { cpSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = dirname(here);

mkdirSync(`${pkgRoot}/dist`, { recursive: true });
cpSync(`${pkgRoot}/src`, `${pkgRoot}/dist`, { recursive: true });
console.log("[mountly-tailwind] copied src → dist");
