import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ResolvedConfig } from "vite";
import { exportKeyToSubpath } from "mountly-manifest";

export interface ManifestFragmentPluginOptions {
  verticalId: string;
  url: string;
  entry?: string;
  team?: string;
  version?: string;
  featureExport?: string;
  exports?: Record<string, string>;
  exposeEntries?: Record<string, string>;
  outDir?: string;
}

/**
 * TypeScript is an optional peer: it powers the fragment's `types` block and
 * declaration emit, and nothing else. A project without it still gets a
 * fragment — one that carries no types — rather than a failed build.
 */
async function loadTypeScript(): Promise<typeof import("typescript/unstable/sync") | undefined> {
  try {
    return await import("typescript/unstable/sync");
  } catch {
    return undefined;
  }
}

/** The `tsc` entry point of the TypeScript this plugin resolves, if any. */
function tscBin(): string | undefined {
  try {
    const packageJson = fileURLToPath(import.meta.resolve("typescript/package.json"));
    return join(dirname(packageJson), "bin", "tsc");
  } catch {
    return undefined;
  }
}

/** Write `mountly.manifest.fragment.json` after a vertical build for CI merge into the host manifest. */
export function mountlyManifestFragmentPlugin(options: ManifestFragmentPluginOptions): Plugin {
  let outDir = options.outDir ?? "dist";
  let root = process.cwd();

  /** Nearest `tsconfig.json` at or above `root`, the way `tsc` itself looks. */
  function findConfigFile(): string | undefined {
    let dir = root;
    for (;;) {
      const candidate = join(dir, "tsconfig.json");
      if (existsSync(candidate)) return candidate;
      const next = dirname(dir);
      if (next === dir || dir === parse(dir).root) return undefined;
      dir = next;
    }
  }

  /**
   * Named runtime exports of each source entry, keyed by absolute path.
   *
   * The checker answers this, rather than a hand-walked AST: it sees through
   * `export * from` and re-exports, which a statement-by-statement scan misses.
   * Type-only exports are dropped — the manifest describes what a host can
   * import at runtime. One session serves every entry; each one spawns a
   * compiler process.
   *
   * Entries are opened as files rather than through a config: a widget need not
   * have a `tsconfig.json` of its own, and an opened file without one still
   * lands in an inferred project the checker can answer for.
   */
  async function collectNamedExports(
    entries: ReadonlyArray<string>,
  ): Promise<Map<string, string[]>> {
    const sources = entries.filter((entry) => /\.(?:[cm]?[jt]sx?)$/i.test(entry));
    const names = new Map<string, string[]>();
    if (sources.length === 0) return names;

    const typescript = await loadTypeScript();
    if (!typescript) return names;
    const { API, SymbolFlags } = typescript;

    const api = new API();
    try {
      const snapshot = api.updateSnapshot({ openFiles: [...sources] });
      for (const entry of sources) {
        const project = snapshot.getDefaultProjectForFile(entry);
        if (!project) continue;
        const sourceFile = project.program.getSourceFile(entry);
        const moduleSymbol = sourceFile && project.checker.getSymbolAtLocation(sourceFile);
        if (!moduleSymbol) continue;
        names.set(
          entry,
          project.checker
            .getExportsOfModule(moduleSymbol)
            .filter(
              (symbol) =>
                symbol.name !== "default" &&
                (symbol.flags & (SymbolFlags.Interface | SymbolFlags.TypeAlias)) === 0,
            )
            .map((symbol) => symbol.name)
            .sort(),
        );
      }
    } finally {
      api.close();
    }
    return names;
  }

  function commonDir(paths: string[]): string {
    const parts = paths.map((value) => resolve(value).split("/"));
    const shared: string[] = [];
    for (let index = 0; ; index++) {
      const segment = parts[0]?.[index];
      if (segment === undefined || parts.some((current) => current[index] !== segment)) break;
      shared.push(segment);
    }
    return shared.length > 0 ? shared.join("/") || "/" : root;
  }

  function declarationPathFor(entry: string, rootDir: string): string {
    return relative(rootDir, entry).replace(/\.(?:[cm]?[jt]sx?)$/i, ".d.ts");
  }

  function emitDeclarations(
    entry: string | undefined,
    exposeEntries: Record<string, string>,
  ): {
    rootDeclaration?: string;
    exportDeclarations: Record<string, string>;
  } {
    const tsc = tscBin();
    if (!entry || !tsc) return { exportDeclarations: {} };

    const sourceEntries = [entry, ...Object.values(exposeEntries)];
    const rootDir = commonDir(sourceEntries);
    const declarationDir = resolve(outDir, "types");
    mkdirSync(declarationDir, { recursive: true });

    // `tsc` owns declaration emit: TypeScript 7's native compiler exposes no
    // in-process emitter, and driving the binary keeps the project's own
    // tsconfig authoritative.
    const emitConfigPath = join(declarationDir, "tsconfig.emit.json");
    const baseConfigPath = findConfigFile();
    writeFileSync(
      emitConfigPath,
      JSON.stringify({
        ...(baseConfigPath ? { extends: baseConfigPath } : {}),
        // `files` and an inherited `include` are additive, and anything outside
        // `rootDir` escapes the `outDir` mapping and lands beside its source.
        // Only the entries below may be compiled.
        include: [],
        exclude: [],
        files: sourceEntries,
        compilerOptions: {
          declaration: true,
          emitDeclarationOnly: true,
          declarationMap: false,
          noEmit: false,
          noEmitOnError: false,
          outDir: declarationDir,
          declarationDir,
          rootDir,
        },
      }),
    );
    try {
      execFileSync(process.execPath, [tsc, "-p", emitConfigPath], { stdio: "pipe" });
    } catch {
      // Type errors must not fail the build here — the widget's own typecheck
      // owns that verdict, and the declarations are still emitted.
    } finally {
      rmSync(emitConfigPath, { force: true });
    }

    const exportDeclarations: Record<string, string> = {};
    for (const [exportKey, exportEntry] of Object.entries(exposeEntries)) {
      exportDeclarations[exportKey] = `./types/${declarationPathFor(exportEntry, rootDir)}`;
    }

    return {
      rootDeclaration: `./types/${declarationPathFor(entry, rootDir)}`,
      exportDeclarations,
    };
  }

  return {
    name: "mountly:manifest-fragment",
    configResolved(config: ResolvedConfig) {
      root = config.root;
      outDir = resolve(root, options.outDir ?? "dist");
    },
    async closeBundle() {
      // Resolve source paths against the Vite root so callers can pass paths relative to
      // their config (resolve(root, abs) leaves an already-absolute path unchanged).
      const entry = options.entry ? resolve(root, options.entry) : undefined;
      const exposeEntries = Object.fromEntries(
        Object.entries(options.exposeEntries ?? {}).map(([key, value]) => [
          key,
          resolve(root, value),
        ]),
      );

      const vertical: Record<string, unknown> = {
        id: options.verticalId,
        url: options.url,
      };
      if (options.team) vertical.team = options.team;
      if (options.version) vertical.version = options.version;
      if (options.featureExport) vertical.featureExport = options.featureExport;

      const declarations = emitDeclarations(entry, exposeEntries);

      const namedExports = await collectNamedExports([
        ...(entry ? [entry] : []),
        ...Object.values(exposeEntries),
      ]);
      const moduleTypes = entry ? [...(namedExports.get(entry) ?? [])] : [];
      if (options.featureExport) moduleTypes.push(options.featureExport);

      if (options.exports && Object.keys(options.exports).length > 0) {
        const mapped: Record<string, string> = {};
        const typedExports: Record<string, string[] | { declaration?: string; names?: string[] }> =
          {};
        for (const [key, value] of Object.entries(options.exports)) {
          mapped[key] = value.startsWith("./") ? value : `./${exportKeyToSubpath(value)}`;
          const exposeEntry = exposeEntries[key];
          const exportNames = exposeEntry ? (namedExports.get(exposeEntry) ?? []) : [];
          const declaration = declarations.exportDeclarations[key];
          if (exportNames.length > 0 || declaration) {
            typedExports[key] =
              declaration || exportNames.length > 0
                ? {
                    ...(declaration ? { declaration } : {}),
                    ...(exportNames.length > 0 ? { names: exportNames } : {}),
                  }
                : exportNames;
          }
        }
        vertical.exports = mapped;
        if (
          moduleTypes.length > 0 ||
          declarations.rootDeclaration ||
          Object.keys(typedExports).length > 0
        ) {
          vertical.types = {
            ...(declarations.rootDeclaration ? { declaration: declarations.rootDeclaration } : {}),
            ...(moduleTypes.length > 0 ? { module: [...new Set(moduleTypes)].sort() } : {}),
            ...(Object.keys(typedExports).length > 0 ? { exports: typedExports } : {}),
          };
        }
      } else if (moduleTypes.length > 0 || declarations.rootDeclaration) {
        vertical.types = {
          ...(declarations.rootDeclaration ? { declaration: declarations.rootDeclaration } : {}),
          module: [...new Set(moduleTypes)].sort(),
        };
      }

      const fragment = {
        version: "2",
        verticals: [vertical],
      };
      writeFileSync(
        join(outDir, "mountly.manifest.fragment.json"),
        `${JSON.stringify(fragment, null, 2)}\n`,
      );
    },
  };
}
