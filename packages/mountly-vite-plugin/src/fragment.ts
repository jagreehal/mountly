import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { exportKeyToSubpath } from "mountly-manifest";
import ts from "typescript";

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

/** Write `mountly.manifest.fragment.json` after a vertical build for CI merge into the host manifest. */
export function mountlyManifestFragmentPlugin(options: ManifestFragmentPluginOptions): Plugin {
  let outDir = options.outDir ?? "dist";
  let root = process.cwd();

  function collectNamedExports(entry: string | undefined): string[] {
    if (!entry) return [];
    if (!/\.(?:[cm]?[jt]sx?)$/i.test(entry)) return [];

    const source = readFileSync(entry, "utf8");
    const sourceFile = ts.createSourceFile(
      entry,
      source,
      ts.ScriptTarget.Latest,
      true,
      entry.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const names = new Set<string>();
    const addBindingName = (name: ts.BindingName) => {
      if (ts.isIdentifier(name)) {
        names.add(name.text);
        return;
      }
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) addBindingName(element.name);
      }
    };
    const hasExport = (node: ts.Node) =>
      (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ) ?? false;

    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
        if (statement.name && hasExport(statement)) names.add(statement.name.text);
        continue;
      }
      if (ts.isVariableStatement(statement) && hasExport(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          addBindingName(declaration.name);
        }
        continue;
      }
      if (ts.isEnumDeclaration(statement) && hasExport(statement)) {
        names.add(statement.name.text);
        continue;
      }
      if (ts.isExportDeclaration(statement) && statement.exportClause) {
        if (ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) {
            names.add(element.name.text);
          }
        }
      }
    }

    return [...names].sort();
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
    if (!entry) return { exportDeclarations: {} };

    const sourceEntries = [entry, ...Object.values(exposeEntries)];
    const rootDir = commonDir(sourceEntries);
    const declarationDir = resolve(outDir, "types");
    mkdirSync(declarationDir, { recursive: true });

    const configPath = ts.findConfigFile(root, (f) => ts.sys.fileExists(f), "tsconfig.json");
    const parsedConfig = configPath
      ? ts.parseJsonConfigFileContent(
          ts.readConfigFile(configPath, (f) => ts.sys.readFile(f)).config,
          ts.sys,
          dirname(configPath),
        )
      : { options: {} as ts.CompilerOptions };

    const program = ts.createProgram({
      rootNames: sourceEntries,
      options: {
        ...parsedConfig.options,
        declaration: true,
        emitDeclarationOnly: true,
        declarationMap: false,
        noEmit: false,
        noEmitOnError: false,
        outDir: declarationDir,
        declarationDir,
        rootDir,
      },
    });
    program.emit(undefined, undefined, undefined, true);

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
    closeBundle() {
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

      const moduleTypes = collectNamedExports(entry);
      if (options.featureExport) moduleTypes.push(options.featureExport);

      if (options.exports && Object.keys(options.exports).length > 0) {
        const mapped: Record<string, string> = {};
        const typedExports: Record<string, string[] | { declaration?: string; names?: string[] }> =
          {};
        for (const [key, value] of Object.entries(options.exports)) {
          mapped[key] = value.startsWith("./") ? value : `./${exportKeyToSubpath(value)}`;
          const exposeEntry = exposeEntries[key];
          const exportNames = collectNamedExports(exposeEntry);
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
