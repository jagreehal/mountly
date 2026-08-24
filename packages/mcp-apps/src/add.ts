import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CLI_ERROR_CODES, cliError } from "./errors.js";

export interface AddArgs {
  name: string;
  entry?: string;
  uri?: string;
  framework?: "react" | "vue" | "svelte" | "vanilla";
  config?: string;
}

export function parseAddArgs(argv: ReadonlyArray<string>): AddArgs {
  const name = argv[0];
  if (!name || name.startsWith("-")) {
    throw cliError(
      CLI_ERROR_CODES.UNKNOWN_OPTION,
      "mountly-mcp add requires a View name",
      "Example: mountly-mcp add settings --framework react",
    );
  }

  const args: AddArgs = { name };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) {
        throw cliError(
          CLI_ERROR_CODES.UNKNOWN_OPTION,
          `${arg} needs a value`,
          "See: mountly-mcp --help",
        );
      }
      i += 1;
      return value;
    };
    if (arg === "--entry") args.entry = next();
    else if (arg === "--uri") args.uri = next();
    else if (arg === "--framework" || arg === "-f") {
      const value = next();
      if (!["react", "vue", "svelte", "vanilla"].includes(value)) {
        throw cliError(
          CLI_ERROR_CODES.UNKNOWN_OPTION,
          `framework "${value}" not supported`,
          "Use: react | vue | svelte | vanilla",
        );
      }
      args.framework = value as AddArgs["framework"];
    } else if (arg === "--config" || arg === "-c") args.config = next();
    else {
      throw cliError(
        CLI_ERROR_CODES.UNKNOWN_OPTION,
        `unknown add option '${arg}'`,
        "Options: --entry --uri --framework --config",
      );
    }
  }
  return args;
}

function detectFramework(cwd: string): NonNullable<AddArgs["framework"]> {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return "react";
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.vue || deps["mountly-vue"]) return "vue";
  if (deps.svelte || deps["mountly-svelte"]) return "svelte";
  if (deps.react) return "react";
  return "vanilla";
}

function findViteConfig(cwd: string, explicit?: string): string {
  if (explicit) {
    const path = resolve(cwd, explicit);
    if (!existsSync(path)) {
      throw cliError(
        CLI_ERROR_CODES.NO_VITE_CONFIG,
        `vite config not found: ${path}`,
        "Pass --config path/to/vite.config.ts",
      );
    }
    return path;
  }
  for (const name of ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"]) {
    const path = join(cwd, name);
    if (existsSync(path)) return path;
  }
  throw cliError(
    CLI_ERROR_CODES.NO_VITE_CONFIG,
    "no vite.config.* in this directory",
    "Run from a Mountly MCP project, or: npx mountly-mcp create my-app --framework react",
  );
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function viewSource(framework: NonNullable<AddArgs["framework"]>, componentName: string): string {
  if (framework === "react") {
    return `import { createMcpView, useToolResult } from "mountly-mcp/react";

interface Result {
  structuredContent?: { title?: string };
}

function ${componentName}() {
  const result = useToolResult<Result>();
  const title = result?.structuredContent?.title ?? "${componentName}";
  return (
    <main style={{ fontFamily: "system-ui", padding: 20 }}>
      <h1>{title}</h1>
      <p>Edit <code>src/${slugify(componentName)}.tsx</code> — data comes from useToolResult().</p>
    </main>
  );
}

createMcpView(${componentName});
`;
  }
  if (framework === "vue") {
    return `import { createMcpView } from "mountly-mcp/vue";
import ${componentName} from "./${componentName}.vue";

createMcpView(${componentName});
`;
  }
  if (framework === "svelte") {
    return `import { createMcpView } from "mountly-mcp/svelte";
import ${componentName} from "./${componentName}.svelte";

createMcpView(${componentName});
`;
  }
  return `import { publishMcpView, type McpViewProps } from "mountly-mcp";

publishMcpView({
  mount(el, props: McpViewProps) {
    el.innerHTML = "<main style=\\"font-family:system-ui;padding:20px\\"><h1>${componentName}</h1><pre></pre></main>";
    const pre = el.querySelector("pre");
    if (pre) pre.textContent = JSON.stringify(props.toolResult?.structuredContent ?? {}, null, 2);
  },
  update(el, props: McpViewProps) {
    const pre = el.querySelector("pre");
    if (pre) pre.textContent = JSON.stringify(props.toolResult?.structuredContent ?? {}, null, 2);
  },
  unmount(el) {
    el.innerHTML = "";
  },
});
`;
}

function vueComponent(componentName: string): string {
  return `<script setup lang="ts">
import { computed } from "vue";
import { useToolResult } from "mountly-mcp/vue";

const result = useToolResult<{ structuredContent?: { title?: string } }>();
const title = computed(() => result.value?.structuredContent?.title ?? "${componentName}");
</script>

<template>
  <main style="font-family: system-ui; padding: 20px">
    <h1>{{ title }}</h1>
    <p>Edit this View — data comes from useToolResult().</p>
  </main>
</template>
`;
}

function svelteComponent(componentName: string): string {
  return `<script lang="ts">
  let { toolResult } = $props();
  const title = $derived(toolResult?.structuredContent?.title ?? "${componentName}");
</script>

<main style="font-family: system-ui; padding: 20px">
  <h1>{title}</h1>
  <p>Edit this View — toolResult arrives as a prop.</p>
</main>
`;
}

/**
 * Add a second View to an existing Mountly MCP Vite project: entry file +
 * `apps[]` row in vite.config. Does not rewrite the user's server.
 */
export function addView(args: AddArgs, cwd = process.cwd()): void {
  const framework: NonNullable<AddArgs["framework"]> = args.framework ?? detectFramework(cwd);
  const configPath = findViteConfig(cwd, args.config);
  const configSource = readFileSync(configPath, "utf8");
  if (!/mountlyMcpViews\s*\(/.test(configSource)) {
    throw cliError(
      CLI_ERROR_CODES.MISSING_VITE_PLUGIN,
      `no mountlyMcpViews() in ${configPath}`,
      `Add mountlyMcpViews({ apps: [...] }) from "mountly-mcp/vite" to ${configPath}`,
    );
  }

  const slug = slugify(args.name) || "view";
  const pascal = slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const uri = args.uri ?? `ui://app/${slug}`;
  if (!uri.startsWith("ui://")) {
    throw cliError(
      CLI_ERROR_CODES.INVALID_UI_URI,
      `uri must start with ui:// (received '${uri}')`,
      "Example: --uri ui://my-server/settings",
    );
  }

  const entry = args.entry ?? `src/${slug}.${framework === "react" ? "tsx" : "ts"}`;
  const entryPath = resolve(cwd, entry);
  if (existsSync(entryPath)) {
    throw cliError(
      CLI_ERROR_CODES.TARGET_EXISTS,
      `entry already exists: ${entryPath}`,
      "Pass a different --entry or remove the file first",
    );
  }
  if (configSource.includes(JSON.stringify(uri)) || configSource.includes(JSON.stringify(slug))) {
    throw cliError(
      CLI_ERROR_CODES.TARGET_EXISTS,
      `${configPath} already declares a View named '${slug}' or uri '${uri}'`,
      "Pick another name, or pass --uri to use a different resource URI",
    );
  }

  const appBlock = `{
          entry: ${JSON.stringify(entry)},
          uri: ${JSON.stringify(uri)},
          name: ${JSON.stringify(slug)},
          displayModes: ["inline", "fullscreen"],
          prefersBorder: true,
          awaitToolResult: true,
        }`;

  // Rewrite the config in memory first: a failure here must not leave a View
  // entry on disk that nothing builds.
  let next: string;
  if (/apps:\s*\[\s*\]/.test(configSource)) {
    next = configSource.replace(/apps:\s*\[\s*\]/, `apps: [\n        ${appBlock},\n      ]`);
  } else if (/apps:\s*\[/.test(configSource)) {
    next = configSource.replace(/apps:\s*\[/, `apps: [\n        ${appBlock},`);
  } else {
    throw cliError(
      CLI_ERROR_CODES.MISSING_VITE_PLUGIN,
      `could not find apps: [] in ${configPath}`,
      "Add an apps array inside mountlyMcpViews({ ... })",
    );
  }

  mkdirSync(dirname(entryPath), { recursive: true });
  writeFileSync(entryPath, viewSource(framework, pascal));
  if (framework === "vue") {
    writeFileSync(join(dirname(entryPath), `${pascal}.vue`), vueComponent(pascal));
  }
  if (framework === "svelte") {
    writeFileSync(join(dirname(entryPath), `${pascal}.svelte`), svelteComponent(pascal));
  }
  writeFileSync(configPath, next);

  process.stdout.write(
    [
      "",
      `✓ Added View "${slug}"`,
      `  entry  ${entry}`,
      `  uri    ${uri}`,
      `  config ${configPath}`,
      "",
      "Next:",
      "  pnpm exec mountly-mcp build",
      `  pnpm exec mountly-mcp dev --app ${slug}`,
      "  Register a tool with resourceUri matching the uri above via registerMcpApps.",
      "",
    ].join("\n"),
  );
}
