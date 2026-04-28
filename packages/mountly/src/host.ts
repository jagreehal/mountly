import { createModuleLoader } from "./assets.js";
import { mountAllIslands, type IslandLoaders, type MountAllIslandsOptions, type MountedIsland } from "./island.js";

export interface HostBootstrapOptions extends MountAllIslandsOptions {
  root?: ParentNode;
  loaders: IslandLoaders;
}

export interface ScriptTagHostOptions extends MountAllIslandsOptions {
  root?: ParentNode;
  css?: "auto" | "none";
}

export function bootstrapMountlyHost(options: HostBootstrapOptions): MountedIsland[] {
  const root = options.root ?? document;
  return mountAllIslands(root, options.loaders, options);
}

function parseLoadersJson(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed ?? {};
  } catch {
    throw new Error("[mountly] invalid data-mountly-loaders JSON on host script tag.");
  }
}

export function bootstrapMountlyHostFromScriptTag(
  script: HTMLScriptElement,
  options: ScriptTagHostOptions = {},
): MountedIsland[] {
  const loaderMap = parseLoadersJson(script.getAttribute("data-mountly-loaders"));
  const loaders: IslandLoaders = {};
  for (const [moduleId, moduleUrl] of Object.entries(loaderMap)) {
    loaders[moduleId] = createModuleLoader(moduleUrl, { css: options.css ?? "auto" });
  }
  return bootstrapMountlyHost({
    ...options,
    loaders,
    root: options.root ?? document,
  });
}
