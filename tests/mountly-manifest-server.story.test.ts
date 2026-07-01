import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import {
  createManifestResponse,
  mergeManifests,
  parseManifest,
  renderMountlyHead,
} from "../packages/mountly-manifest/src/server.js";

const base = parseManifest({
  version: "2",
  platform: {
    imports: {
      react: "https://esm.sh/react@19.2.7",
      "react-dom": "https://esm.sh/react-dom@19.2.7",
      "react-dom/client": "https://esm.sh/react-dom@19.2.7/client",
      "mountly-manifest": "https://esm.sh/mountly-manifest",
    },
  },
  verticals: [{ id: "a", url: "/a.js", featureExport: "a" }],
});

describe("mountly-manifest/server", () => {
  it("mergeManifests dedupes verticals by id, later wins", ({ task }) => {
    story.init(task);
    story.given("a base manifest and a tenant override that replaces a + adds b");
    const merged = mergeManifests(base, {
      verticals: [
        { id: "b", url: "/b.js", featureExport: "b" },
        { id: "a", url: "/a-v2.js", featureExport: "a" },
      ],
    });
    story.then("a is replaced and b is appended");
    expect(merged.verticals.map((v) => `${v.id}:${v.url}`)).toEqual(["a:/a-v2.js", "b:/b.js"]);
  });

  it("mergeManifests merges platform imports", ({ task }) => {
    story.init(task);
    const merged = mergeManifests(base, {
      platform: { imports: { "@acme/ui": "https://esm.sh/@acme/ui@1" } },
    });
    story.then("base and override imports both present");
    expect(merged.platform.imports.react).toBe("https://esm.sh/react@19.2.7");
    expect(merged.platform.imports["@acme/ui"]).toBe("https://esm.sh/@acme/ui@1");
  });

  it("renderMountlyHead emits a static import map and define module", ({ task }) => {
    story.init(task);
    story.when("renderMountlyHead runs for SSR");
    const head = renderMountlyHead(base);
    story.then("the head has an import map and a define module, no client fetch");
    expect(head).toContain('<script type="importmap">');
    expect(head).toContain("defineMountlyFeatureFromManifest");
    expect(head).not.toContain("fetch(");
    // vertical specifier is mapped to its url
    expect(head).toContain('"a": "/a.js"');
  });

  it("renderMountlyHead escapes < to prevent tag breakout", ({ task }) => {
    story.init(task);
    story.given("a manifest whose value contains a closing script-ish sequence");
    const tricky = mergeManifests(base, {
      verticals: [{ id: "x", url: "/x.js</script>", featureExport: "x" }],
    });
    const head = renderMountlyHead(tricky);
    story.then("the raw </script> does not appear in the inlined JSON");
    expect(head).toContain("\\u003c/script>");
  });

  it("createManifestResponse returns 200 for valid, 422 for invalid", async ({ task }) => {
    story.init(task);
    const ok = createManifestResponse(base);
    story.then("a valid manifest serves 200 JSON");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("application/json");

    story.given("a manifest with React major skew");
    const bad = createManifestResponse(
      parseManifest({
        version: "2",
        platform: {
          imports: {
            react: "https://esm.sh/react@19.2.7",
            "react-dom": "https://esm.sh/react-dom@18.0.0",
            "react-dom/client": "https://esm.sh/react-dom@18.0.0/client",
          },
        },
        verticals: [{ id: "x", url: "/x.js" }],
      }),
    );
    story.then("an invalid manifest serves 422 with issues");
    expect(bad.status).toBe(422);
    const body = await bad.json();
    expect(body.issues.some((i: { message: string }) => /duplicate React/.test(i.message))).toBe(
      true,
    );
  });
});
