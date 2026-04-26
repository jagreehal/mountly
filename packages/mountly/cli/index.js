#!/usr/bin/env node
import { argv, exit, stderr, stdout } from "node:process";
import { init } from "./commands/init.js";

const USAGE = `mountly — scaffold mountly widgets.

USAGE
  mountly init <name> [options]

OPTIONS
  --framework <name>   Framework: react|vue|svelte (default: react)
  --tailwind           Wire up mountly-tailwind preset (default: true)
  --no-tailwind        Skip the Tailwind preset
  --dir <path>         Output directory (default: ./<name>)
  -h, --help           Show this help

EXAMPLES
  npx mountly init my-widget
  npx mountly init my-widget --framework react --no-tailwind
  npx mountly init my-widget --framework vue
  npx mountly init my-widget --framework svelte
`;

const args = argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  stdout.write(USAGE);
  exit(0);
}

const [command, ...rest] = args;

if (command === "init") {
  try {
    await init(rest);
  } catch (e) {
    stderr.write(`\x1b[31m${e.message}\x1b[0m\n`);
    exit(1);
  }
} else {
  stderr.write(`\x1b[31mUnknown command: ${command}\x1b[0m\n${USAGE}`);
  exit(1);
}
