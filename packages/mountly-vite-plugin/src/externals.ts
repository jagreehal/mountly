/** Which imports a build leaves for the page to provide, per framework. */

export type MountlyWidgetFramework = "react" | "vue" | "svelte";

const PLATFORM_EXTERNALS = ["mountly", /^mountly\//];

const FRAMEWORK_EXTERNALS: Record<MountlyWidgetFramework, string[]> = {
  react: ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "mountly-react"],
  vue: ["vue", "mountly-vue"],
  svelte: ["svelte", "mountly-svelte"],
};

const FRAMEWORK_BUNDLE: Record<MountlyWidgetFramework, string[]> = {
  react: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  vue: ["vue"],
  svelte: ["svelte"],
};

export function getFrameworkPeerExternals(
  framework: MountlyWidgetFramework,
): Array<string | RegExp> {
  return [...PLATFORM_EXTERNALS, ...FRAMEWORK_EXTERNALS[framework]];
}

/**
 * The self-contained build's whole promise is "drop this file in a page and it
 * works", so mountly's own runtime helpers are bundled in rather than
 * externalised: the host then needs no import map at all. The peer build still
 * externalises them, because sharing through the host's import map is the point
 * of that build.
 */
export function getSelfContainedExternals(
  framework: MountlyWidgetFramework,
): Array<string | RegExp> {
  return FRAMEWORK_EXTERNALS[framework].filter((id) => !FRAMEWORK_BUNDLE[framework].includes(id));
}
