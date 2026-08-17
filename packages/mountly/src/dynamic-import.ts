type DynamicImporter = <T = unknown>(specifier: string) => Promise<T>;

// Avoid emitting `import(variable)` directly in dist output. Vite still warns
// on that shape in packed dependencies, even when `@vite-ignore` is present.
//
// Built on first use, never at module scope: `new Function` throws under a CSP
// without 'unsafe-eval' (e.g. the CSP MCP Apps hosts are required to enforce),
// which would kill the whole bundle on load — including consumers that never
// load a remote.
// ponytail: loading a remote still needs 'unsafe-eval'; the only alternative is
// a bare `import(specifier)`, which brings the Vite warning back for everyone.
let dynamicImport: DynamicImporter | undefined;

export function importBySpecifier<T = unknown>(specifier: string): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- intentional: hides the bare dynamic import from Vite's static analyzer
  dynamicImport ??= new Function("specifier", "return import(specifier);") as DynamicImporter;
  return dynamicImport<T>(specifier);
}
