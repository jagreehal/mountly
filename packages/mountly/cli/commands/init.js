import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync,
  statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(__dirname, "..", "templates");

const SUPPORTED = ["react", "vue", "svelte"];

export async function init(args) {
  const name = args[0];
  if (!name || name.startsWith("--")) {
    throw new Error("init requires a widget name. e.g. mountly init my-widget");
  }

  let framework = "react";
  let tailwind = true;
  let dir = `./${name}`;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--framework") framework = args[++i];
    else if (a === "--tailwind") tailwind = true;
    else if (a === "--no-tailwind") tailwind = false;
    else if (a === "--dir") dir = args[++i];
    else throw new Error(`Unknown flag: ${a}`);
  }

  if (!SUPPORTED.includes(framework)) {
    throw new Error(
      `framework "${framework}" not yet supported. Available: ${SUPPORTED.join(", ")}`,
    );
  }

  const target = resolve(dir);
  if (existsSync(target)) {
    throw new Error(`Target directory already exists: ${target}`);
  }
  mkdirSync(target, { recursive: true });

  const tplDir = join(TEMPLATES, framework);
  cpSync(tplDir, target, { recursive: true });

  renderTemplates(target, { name, tailwind });
  printNextSteps({ name, dir, target });
}

function printNextSteps({ name, dir, target }) {
  // Use the dir the user passed (e.g. "./my-widget" or "/abs/path/foo") so
  // the cd command is verbatim copy-paste.
  const lines = [
    "",
    `✓ Scaffolded ${name} at ${target}`,
    "",
    "Next steps:",
    `  cd ${dir}`,
    "  pnpm install",
    "  pnpm build",
    "",
    "Drop the widget into any HTML page:",
    "",
    "  <div id=\"mount\"></div>",
    "  <script type=\"module\">",
    `    import widget from "./${name}/dist/index.js";`,
    "    widget.mount(document.getElementById(\"mount\"));",
    "  </script>",
    "",
    "For lazy-loading triggers (Features), see the mountly README.",
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
      .replaceAll("{{stylesExtension}}", stylesExtension);
    writeFileSync(full.replace(/\.tmpl$/, ""), content);
    unlinkSync(full);
  }
}
