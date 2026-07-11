import { existsSync } from "node:fs";
import { join } from "node:path";
import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import {
  codegenManifestTypes,
  composeManifestFromFragments,
  manifestJsonSchema,
  manifestToFeatureModules,
  manifestToImportMap,
  manifestToPlatformRuntimeOptions,
  manifestRemoteSpecifiers,
  parseManifest,
  renderImportMapScript,
  resolveExportUrl,
  unwrapDefault,
  validateManifest,
  verticalExportSpecifier,
} from "../packages/mountly-manifest/src/index.js";

const sampleManifest = {
  version: "2" as const,
  platform: {
    imports: {
      react: "https://cdn.example/react.js",
      "react-dom": "https://cdn.example/react-dom.js",
      "react-dom/client": "https://cdn.example/react-dom-client.js",
      mountly: "https://cdn.example/mountly.js",
    },
  },
  verticals: [
    {
      id: "billing",
      url: "https://cdn.example/billing@1.0.0/peer.js",
      team: "payments",
      featureExport: "billingFeature",
      types: {
        declaration: "./types/index.d.ts",
        module: ["billingFeature"],
        exports: {
          "./Checkout": {
            declaration: "./types/Checkout.d.ts",
            names: ["Checkout"],
          },
        },
      },
      exports: {
        "./Checkout": "./Checkout.js",
      },
    },
    {
      id: "chat",
      url: "https://cdn.example/chat@2.0.0/peer.js",
      alias: "@acme/chat",
      moduleExport: "default",
    },
  ],
};

describe("mountly-manifest", () => {
  it("parseManifest validates manifest v2", ({ task }) => {
    story.init(task);
    story.given("a valid manifest payload");
    const manifest = parseManifest(sampleManifest);
    story.then("vertical ids are preserved");
    expect(manifest.verticals[0]?.id).toBe("billing");
  });

  it("parseManifest throws on invalid manifest", ({ task }) => {
    story.init(task);
    story.given("a manifest with empty platform imports");
    story.when("parseManifest is called");
    story.then("a helpful error is thrown");
    expect(() =>
      parseManifest({
        version: "2",
        platform: { imports: {} },
        verticals: [{ id: "billing", url: "https://cdn.example/billing.js" }],
      }),
    ).toThrow(/invalid manifest/);
  });

  it("parseManifest rejects manifest v1", ({ task }) => {
    story.init(task);
    expect(() =>
      parseManifest({
        version: "1",
        platform: {
          imports: {
            react: "https://cdn.example/react.js",
            "react-dom": "https://cdn.example/react-dom.js",
            "react-dom/client": "https://cdn.example/react-dom-client.js",
          },
        },
        verticals: [{ id: "billing", url: "https://cdn.example/billing.js" }],
      }),
    ).toThrow(/invalid manifest/);
  });

  it("manifestToImportMap merges platform, vertical, and export specifiers", ({ task }) => {
    story.init(task);
    const manifest = parseManifest(sampleManifest);
    story.when("manifestToImportMap runs");
    const imports = manifestToImportMap(manifest);
    story.then("vertical aliases, ids, and subpath exports are mapped");
    expect(imports.mountly).toBe("https://cdn.example/mountly.js");
    expect(imports.billing).toBe("https://cdn.example/billing@1.0.0/peer.js");
    expect(imports["billing/Checkout"]).toBe("https://cdn.example/billing@1.0.0/Checkout.js");
    expect(imports["@acme/chat"]).toBe("https://cdn.example/chat@2.0.0/peer.js");
  });

  it("verticalExportSpecifier builds subpath specifiers", ({ task }) => {
    story.init(task);
    const vertical = parseManifest(sampleManifest).verticals[0]!;
    expect(verticalExportSpecifier(vertical, "./Checkout")).toBe("billing/Checkout");
  });

  it("resolveExportUrl joins relative export paths to vertical base", ({ task }) => {
    story.init(task);
    const vertical = parseManifest(sampleManifest).verticals[0]!;
    expect(resolveExportUrl(vertical, "./Checkout.js")).toBe(
      "https://cdn.example/billing@1.0.0/Checkout.js",
    );
  });

  it("manifestRemoteSpecifiers lists all importable remotes", ({ task }) => {
    story.init(task);
    const specifiers = manifestRemoteSpecifiers(parseManifest(sampleManifest));
    expect(specifiers).toEqual(
      expect.arrayContaining(["billing", "billing/Checkout", "@acme/chat"]),
    );
  });

  it("manifestToFeatureModules skips featureExport verticals", ({ task }) => {
    story.init(task);
    const modules = manifestToFeatureModules(parseManifest(sampleManifest));
    story.then("only widget-module verticals are included");
    expect(modules).toEqual({
      chat: {
        moduleUrl: "@acme/chat",
        moduleExport: "default",
      },
    });
  });

  it("manifestToPlatformRuntimeOptions requires React keys", ({ task }) => {
    story.init(task);
    story.when("manifestToPlatformRuntimeOptions runs");
    const runtime = manifestToPlatformRuntimeOptions(parseManifest(sampleManifest));
    story.then("React URLs and merged imports are returned");
    expect(runtime.react).toBe("https://cdn.example/react.js");
    expect(runtime.imports?.billing).toBe("https://cdn.example/billing@1.0.0/peer.js");
    expect(runtime.imports?.["billing/Checkout"]).toBe(
      "https://cdn.example/billing@1.0.0/Checkout.js",
    );
  });

  it("renderImportMapScript returns HTML snippet", ({ task }) => {
    story.init(task);
    const html = renderImportMapScript(parseManifest(sampleManifest));
    story.then("output is a script tag with import map JSON");
    expect(html).toContain('<script type="importmap">');
    expect(html).toContain('"billing/Checkout"');
  });

  it("composeManifestFromFragments builds a host manifest from fragments", ({ task }) => {
    story.init(task);
    const fragmentDir = join(import.meta.dirname, "fixtures", "vite-widget", "dist-exposes");
    const fragmentPath = join(fragmentDir, "mountly.manifest.fragment.json");
    const { manifest } = composeManifestFromFragments({
      root: join(import.meta.dirname, "fixtures", "vite-widget"),
      fragments: ["dist-exposes/mountly.manifest.fragment.json"],
    });
    story.then("vertical urls and types are absolutized against the host root");
    expect(manifest.verticals[0]?.id).toBe("vite-widget");
    expect(manifest.verticals[0]?.url).toMatch(/dist-exposes\/peer\.js$/);
    expect(manifest.platform.imports.react).toContain("esm.sh/react@");
    expect(existsSync(fragmentPath)).toBe(true);
  });

  it("composeManifestFromFragments throws when a fragment is missing", ({ task }) => {
    story.init(task);
    story.when("a missing fragment path is passed with strict mode");
    story.then("compose fails with a helpful message");
    expect(() =>
      composeManifestFromFragments({
        root: import.meta.dirname,
        fragments: ["missing/mountly.manifest.fragment.json"],
      }),
    ).toThrow(/fragment not found/);
  });

  it("codegenManifestTypes emits declare module blocks", ({ task }) => {
    story.init(task);
    const dts = codegenManifestTypes(parseManifest(sampleManifest));
    expect(dts).toContain('declare module "billing/Checkout"');
    expect(dts).toContain('declare module "@acme/chat"');
    expect(dts).toContain("export const billingFeature: unknown;");
    expect(dts).toContain("export const Checkout: unknown;");
  });

  it("codegenManifestTypes can re-export local declaration modules", ({ task }) => {
    story.init(task);
    const dts = codegenManifestTypes(parseManifest(sampleManifest), {
      resolveDeclarationModule: ({ specifier }) => `./.mountly/${specifier}`,
      resolveExportNames: ({ vertical, exportKey }) => {
        if (!exportKey) return vertical.types?.module ?? [];
        const value = vertical.types?.exports?.[exportKey];
        return Array.isArray(value) ? value : (value?.names ?? []);
      },
    });
    expect(dts).toContain('export { billingFeature } from "./.mountly/billing"');
    expect(dts).toContain('export { Checkout } from "./.mountly/billing/Checkout"');
    expect(dts).toContain('typeof import("./.mountly/billing/Checkout")');
  });

  it("unwrapDefault returns the default export when present", ({ task }) => {
    story.init(task);
    story.given("a module namespace with a default export");
    story.then("unwrapDefault returns the default, else the module itself");
    expect(unwrapDefault({ default: 42, named: 1 })).toBe(42);
    expect(unwrapDefault({ named: 1 })).toEqual({ named: 1 });
    expect(unwrapDefault(null)).toBe(null);
  });

  it("validateManifest passes a consistent manifest", ({ task }) => {
    story.init(task);
    story.given("a manifest with matching React pins and mountly-manifest mapped");
    const manifest = parseManifest({
      version: "2",
      platform: {
        imports: {
          react: "https://esm.sh/react@19.2.7",
          "react-dom": "https://esm.sh/react-dom@19.2.7",
          "react-dom/client": "https://esm.sh/react-dom@19.2.7/client",
          "mountly-manifest": "https://esm.sh/mountly-manifest",
        },
      },
      verticals: [{ id: "billing", url: "/billing.js", featureExport: "billing" }],
    });
    story.then("no issues are reported");
    expect(validateManifest(manifest)).toEqual([]);
  });

  it("validateManifest flags duplicate React and duplicate ids", ({ task }) => {
    story.init(task);
    story.given("a manifest with React major skew and a repeated vertical id");
    const manifest = parseManifest({
      version: "2",
      platform: {
        imports: {
          react: "https://esm.sh/react@19.2.7",
          "react-dom": "https://esm.sh/react-dom@18.3.1",
          "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
        },
      },
      verticals: [
        { id: "a", url: "/a.js" },
        { id: "a", url: "/b.js" },
      ],
    });
    story.when("validateManifest runs");
    const issues = validateManifest(manifest);
    story.then("errors surface first, including the duplicate-React warning");
    expect(issues[0]?.level).toBe("error");
    expect(issues.some((i) => /duplicate React/.test(i.message))).toBe(true);
    expect(issues.some((i) => /must be unique/.test(i.message))).toBe(true);
  });

  it("validateManifest rejects export keys without ./ prefix", ({ task }) => {
    story.init(task);
    const manifest = parseManifest({
      version: "2",
      platform: {
        imports: {
          react: "https://esm.sh/react@19.2.7",
          "react-dom": "https://esm.sh/react-dom@19.2.7",
          "react-dom/client": "https://esm.sh/react-dom@19.2.7/client",
        },
      },
      verticals: [
        {
          id: "billing",
          url: "/billing/peer.js",
          exports: { Checkout: "./Checkout.js" },
        },
      ],
    });
    const issues = validateManifest(manifest);
    expect(issues.some((i) => /must start with/.test(i.message))).toBe(true);
  });

  it("manifestJsonSchema produces a JSON Schema for the manifest", ({ task }) => {
    story.init(task);
    const schema = manifestJsonSchema();
    story.then("top-level manifest properties are described");
    expect(Object.keys(schema.properties as object)).toEqual(
      expect.arrayContaining(["version", "platform", "verticals"]),
    );
  });
});
