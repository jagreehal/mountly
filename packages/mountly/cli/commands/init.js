import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(__dirname, "..", "templates");

const SUPPORTED = ["react", "vue", "svelte"];
const BUNDLERS = ["tsup"];

const BUNDLER_DEV_DEPS = {
  react: {
    vite: ',\n    "vite": "^8.0.0",\n    "mountly-vite-plugin": "^0.1.0",\n    "@vitejs/plugin-react": "^6.0.0"',
    tsup: ',\n    "tsup": "^8.3.0"',
  },
  vue: {
    vite: ',\n    "vite": "^8.0.0",\n    "mountly-vite-plugin": "^0.1.0",\n    "@vitejs/plugin-vue": "^6.0.0"',
    tsup: ',\n    "tsup": "^8.3.0"',
  },
  svelte: {
    vite: ',\n    "vite": "^8.0.0",\n    "mountly-vite-plugin": "^0.1.0",\n    "@sveltejs/vite-plugin-svelte": "^7.0.0"',
    tsup: ',\n    "tsup": "^8.3.0"',
  },
};

// Bump in lockstep with the mountly package version so scaffolds pin a real release.
const MOUNTLY_VERSION = "0.2.3";
const DEFAULT_CDN = "https://esm.sh";

export async function init(args) {
  if (args.includes("--host")) {
    return initHost(args.filter((a) => a !== "--host"));
  }

  const name = args[0];
  if (!name || name.startsWith("--")) {
    throw new Error("init requires a widget name. e.g. mountly init my-widget");
  }

  let framework = "react";
  let tailwind = true;
  let bundler = "tsup";
  let dir = `./${name}`;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--framework") framework = args[++i];
    else if (a === "--tailwind") tailwind = true;
    else if (a === "--no-tailwind") tailwind = false;
    else if (a === "--bundler") bundler = args[++i];
    else if (a === "--dir") dir = args[++i];
    else throw new Error(`Unknown flag: ${a}`);
  }

  if (!SUPPORTED.includes(framework)) {
    throw new Error(
      `framework "${framework}" not yet supported. Available: ${SUPPORTED.join(", ")}`,
    );
  }
  if (!BUNDLERS.includes(bundler)) {
    throw new Error(`bundler "${bundler}" not supported. Available: ${BUNDLERS.join(", ")}`);
  }

  const target = resolve(dir);
  if (existsSync(target)) {
    throw new Error(`Target directory already exists: ${target}`);
  }
  mkdirSync(target, { recursive: true });

  const tplDir = join(TEMPLATES, framework);
  cpSync(tplDir, target, { recursive: true });

  renderTemplates(target, { name, tailwind, framework, bundler });
  pruneBundlerFiles(target, bundler);
  printNextSteps({ name, dir, target, bundler });
}

export async function initHost(args) {
  const name = args[0];
  if (!name || name.startsWith("--")) {
    throw new Error("init --host requires a name. e.g. mountly init my-host --host");
  }

  let dir = `./${name}`;
  let cdn = DEFAULT_CDN;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--dir") dir = args[++i];
    else if (a === "--cdn") cdn = args[++i].replace(/\/+$/, "");
    else throw new Error(`Unknown flag: ${a}`);
  }

  const target = resolve(dir);
  if (existsSync(target)) {
    throw new Error(`Target directory already exists: ${target}`);
  }
  mkdirSync(target, { recursive: true });
  cpSync(join(TEMPLATES, "host"), target, { recursive: true });

  const ctx = {
    name,
    cdn,
    mountlyVersion: MOUNTLY_VERSION,
    mountlyRuntimeUrl: `${cdn}/mountly@${MOUNTLY_VERSION}/runtime`,
  };
  renderHostTemplates(target, ctx);

  process.stdout.write(
    [
      "",
      `✓ Scaffolded host shell ${name} at ${target}`,
      "",
      "Next steps:",
      `  cd ${dir}`,
      "  pnpm install",
      "  pnpm dev        # serve the shell",
      "  pnpm validate   # check manifest.json",
      "",
      "Edit manifest.json to point verticals at your published dist/peer.js URLs.",
      "",
    ].join("\n"),
  );
}

function renderHostTemplates(dir, ctx) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      renderHostTemplates(full, ctx);
      continue;
    }
    if (!entry.endsWith(".tmpl")) continue;
    const content = readFileSync(full, "utf8")
      .replaceAll("{{name}}", ctx.name)
      .replaceAll("{{cdn}}", ctx.cdn)
      .replaceAll("{{mountlyVersion}}", ctx.mountlyVersion)
      .replaceAll("{{mountlyRuntimeUrl}}", ctx.mountlyRuntimeUrl);
    writeFileSync(full.replace(/\.tmpl$/, ""), content);
    unlinkSync(full);
  }
}

function pruneBundlerFiles(target, bundler) {
  if (bundler === "vite") {
    const tsupConfig = join(target, "tsup.config.ts");
    if (existsSync(tsupConfig)) unlinkSync(tsupConfig);
    return;
  }
  const viteConfig = join(target, "vite.config.ts");
  if (existsSync(viteConfig)) unlinkSync(viteConfig);
}

function printNextSteps({ name, dir, target, bundler }) {
  const lines = [
    "",
    `✓ Scaffolded ${name} at ${target} (${bundler})`,
    "",
    "Next steps:",
    `  cd ${dir}`,
    "  pnpm install",
    "  pnpm build",
    "",
    "Drop the widget into any HTML page:",
    "",
    '  <div id="mount"></div>',
    '  <script type="module">',
    `    import widget from "./${name}/dist/index.js";`,
    '    widget.mount(document.getElementById("mount"));',
    "",
    "For multi-vertical hosts, publish dist/peer.js to your CDN and register it in a mountly manifest.",
    "",
  ];
  process.stdout.write(lines.join("\n"));
}

function renderTemplates(dir, ctx) {
  const tailwindDepsBlock = ctx.tailwind
    ? ',\n    "@tailwindcss/cli": "^4.0.0",\n    "tailwindcss": "^4.0.0",\n    "mountly-tailwind": "^0.1.0"'
    : "";
  const tailwindBuildScript = ctx.tailwind
    ? "tailwindcss -i ./src/styles.css -o ./src/styles.generated.css --minify && "
    : "";
  const tailwindImport = ctx.tailwind ? '@import "mountly-tailwind";\n' : "";
  const stylesExtension = ctx.tailwind ? "generated.css" : "css";
  const bundlerBuildCommand = ctx.bundler === "vite" ? "vite build" : "tsup";
  const bundlerDevCommand = ctx.bundler === "vite" ? "vite build --watch" : "tsup --watch";
  const bundlerDevDependencies = BUNDLER_DEV_DEPS[ctx.framework]?.[ctx.bundler] ?? "";

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      renderTemplates(full, ctx);
      continue;
    }
    if (!entry.endsWith(".tmpl")) continue;
    const content = readFileSync(full, "utf8")
      .replaceAll("{{name}}", ctx.name)
      .replaceAll("{{tailwindImport}}", tailwindImport)
      .replaceAll("{{tailwindDeps}}", tailwindDepsBlock)
      .replaceAll("{{tailwindBuildScript}}", tailwindBuildScript)
      .replaceAll("{{stylesExtension}}", stylesExtension)
      .replaceAll("{{bundlerBuildCommand}}", bundlerBuildCommand)
      .replaceAll("{{bundlerDevCommand}}", bundlerDevCommand)
      .replaceAll("{{bundlerDevDependencies}}", bundlerDevDependencies);
    writeFileSync(full.replace(/\.tmpl$/, ""), content);
    unlinkSync(full);
  }
}
