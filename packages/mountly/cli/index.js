#!/usr/bin/env node
import { argv, exit, stderr, stdout } from "node:process";
import { init } from "./commands/init.js";
import { manifest } from "./commands/manifest.js";

const USAGE = `mountly — scaffold mountly widgets and hosts.

USAGE
  mountly init <name> [options]          Scaffold a widget (remote)
  mountly init <name> --host [options]   Scaffold a host shell
  mountly manifest validate <path>       Validate a manifest JSON file
  mountly manifest codegen <path>        Generate TypeScript remote module declarations

INIT OPTIONS
  --framework <name>   Framework: react|vue|svelte (default: react)
  --bundler <name>     Bundler: tsup (default: tsup)
  --tailwind           Wire up mountly-tailwind preset (default: true)
  --no-tailwind        Skip the Tailwind preset
  --dir <path>         Output directory (default: ./<name>)

INIT --host OPTIONS
  --dir <path>         Output directory (default: ./<name>)
  --cdn <url>          ESM CDN base for import map (default: https://esm.sh)

EXAMPLES
  npx mountly init my-widget
  npx mountly init my-widget --framework vue --no-tailwind
  npx mountly init my-host --host
  npx mountly manifest validate ./manifest.json
`;

const args = argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  stdout.write(USAGE);
  exit(0);
}

const [command, ...rest] = args;

const COMMANDS = { init, manifest };

if (COMMANDS[command]) {
  try {
    await COMMANDS[command](rest);
  } catch (e) {
    stderr.write(`\x1b[31m${e.message}\x1b[0m\n`);
    exit(1);
  }
} else {
  stderr.write(`\x1b[31mUnknown command: ${command}\x1b[0m\n${USAGE}`);
  exit(1);
}
