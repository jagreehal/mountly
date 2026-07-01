type DynamicImporter = <T = unknown>(specifier: string) => Promise<T>;

// Avoid emitting `import(variable)` directly in dist output. Vite still warns
// on that shape in packed dependencies, even when `@vite-ignore` is present.
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- intentional: hides the bare dynamic import from Vite's static analyzer
const dynamicImport = new Function("specifier", "return import(specifier);") as DynamicImporter;

export function importBySpecifier<T = unknown>(specifier: string): Promise<T> {
  return dynamicImport<T>(specifier);
}
