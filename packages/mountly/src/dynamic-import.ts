type DynamicImporter = <T = unknown>(specifier: string) => Promise<T>;

/**
 * Import a module by a specifier only known at runtime.
 *
 * Two ways to do this, and neither is free:
 *
 * - `new Function("s", "return import(s)")` hides the call from Vite's static
 *   analyzer, so consumers get a clean build — but it is `eval`, and a page
 *   served with a CSP that omits `'unsafe-eval'` cannot run it. That is not an
 *   exotic configuration: it is the default posture in regulated environments,
 *   and it is what the MCP Apps spec requires hosts to enforce.
 * - A bare `import(specifier)` works under any CSP, and costs a build-time
 *   warning from bundlers that cannot see where the specifier points.
 *
 * So: try the first, fall back to the second. Hosts that allow `unsafe-eval`
 * keep the quiet build; hosts that do not can still load a module instead of
 * failing outright. The fallback is what makes strict-CSP hosts work at all, so
 * the warning it may produce is the price of the feature existing.
 *
 * Resolved on first use rather than at module scope: constructing the function
 * eagerly would throw during import under a strict CSP and take down the whole
 * bundle, including consumers that never load a module by specifier.
 */
let dynamicImport: DynamicImporter | undefined;

function resolveImporter(): DynamicImporter {
  if (dynamicImport) return dynamicImport;
  try {
    // `arguments[0]` rather than a named parameter so the eval'd body carries
    // no `import(<identifier>)` for the post-build annotator to mistake for a
    // real dynamic import — see scripts/annotate-dynamic-imports.mjs.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- intentional: keeps the specifier opaque to bundler static analysis
    dynamicImport = new Function("return import(arguments[0]);") as DynamicImporter;
  } catch {
    // EvalError / CSP violation — 'unsafe-eval' is not permitted here.
    dynamicImport = <T>(specifier: string) =>
      import(/* @vite-ignore */ /* webpackIgnore: true */ specifier) as Promise<T>;
  }
  return dynamicImport;
}

export function importBySpecifier<T = unknown>(specifier: string): Promise<T> {
  return resolveImporter()<T>(specifier);
}
