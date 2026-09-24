import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { shimWorkers } from "../packages/mountly-vite-plugin/src/embed";

/** The chunk without the shim declaration the rewrite prepends. */
const SHIM_LENGTH = shimWorkers("new Worker(u)")!.length - "new __mountlyWorker(u)".length;
const body = (code: string) => shimWorkers(code)?.slice(SHIM_LENGTH) ?? null;

describe("Cross-origin worker rewrite", () => {
  it("reroutes only real constructor calls", ({ task }) => {
    story.init(task);
    story.given("a chunk that constructs two workers");

    const out = shimWorkers(
      'const a = new Worker(u, { type: "module" }); const b = new Worker(v);',
    );

    story.then("both go through the shim, which the chunk now declares");
    expect(out?.startsWith("function __mountlyWorker(")).toBe(true);
    expect(body('const a = new Worker(u, { type: "module" }); const b = new Worker(v);')).toBe(
      'const a = new __mountlyWorker(u, { type: "module" }); const b = new __mountlyWorker(v);',
    );
  });

  it("leaves the same characters alone when they are content", ({ task }) => {
    story.init(task);
    story.given("new Worker( inside a string, a template, a comment and an inline worker's source");

    const code = [
      'const tip = "Example: new Worker(url)";',
      "const t = `new Worker(${x})`;",
      "/* new Worker(url) */",
      'const inline = "self.onmessage = () => new Worker(nested)";',
      "const w = new Worker(u);",
    ].join("\n");

    story.then("only the real call changes");
    expect(body(code)).toBe(
      code.replace("const w = new Worker(u);", "const w = new __mountlyWorker(u);"),
    );
  });

  it("keeps offsets right after non-ASCII text", ({ task }) => {
    story.init(task);
    story.given("multi-byte characters before the call");

    expect(body('const s = "héllo — 日本 🚀"; new Worker(u);')).toBe(
      'const s = "héllo — 日本 🚀"; new __mountlyWorker(u);',
    );
  });

  it("skips calls whose Worker is a local binding, and only those", ({ task }) => {
    story.init(task);
    story.given("Worker bound by a parameter, a catch, a block const, a hoisted var and an arrow");

    const cases: Array<[string, string]> = [
      // An injected constructor is the author's, not the browser's.
      ["function make(Worker) { return new Worker(a); } new Worker(b);", "a"],
      ["try {} catch (Worker) { new Worker(a); } new Worker(b);", "a"],
      ["{ const Worker = Pool; new Worker(a); } new Worker(b);", "a"],
      ["function f() { new Worker(a); var Worker = Pool; } new Worker(b);", "a"],
      ["const f = (Worker) => new Worker(a); new Worker(b);", "a"],
      ["function f({ Worker }) { return new Worker(a); } new Worker(b);", "a"],
      ["function f(...[Worker]) { return new Worker(a); } new Worker(b);", "a"],
    ];

    story.then("the shadowed call is untouched and the platform call is rerouted");
    for (const [code, local] of cases) {
      // The code rides along so a failure names the case.
      expect({ code, out: body(code) }).toEqual({
        code,
        out: code.replace("new Worker(b)", "new __mountlyWorker(b)"),
      });
      expect(code).toContain(`new Worker(${local})`);
    }
  });

  it("gives parameter defaults their own scope, apart from the body", ({ task }) => {
    story.init(task);
    story.given("a default that runs before the body's own Worker exists");

    story.then("the default means the platform Worker; the body's calls mean the local one");
    expect(body("function make(w = new Worker(a)) { const Worker = Pool; new Worker(b); }")).toBe(
      "function make(w = new __mountlyWorker(a)) { const Worker = Pool; new Worker(b); }",
    );
    expect(body("function make(w = new Worker(a)) { var Worker = Pool; }")).toBe(
      "function make(w = new __mountlyWorker(a)) { var Worker = Pool; }",
    );
    story.and("a default can still see an earlier parameter named Worker");
    expect(shimWorkers("function make(Worker, w = new Worker(a)) {}")).toBeNull();
  });

  it("keeps a static block's vars inside the block", ({ task }) => {
    story.init(task);
    story.given("a class static block that declares var Worker");

    story.then("the block's own call is local; the call outside is the platform's");
    expect(
      body("class Pool { static { var Worker = Custom; new Worker(a); } } new Worker(b);"),
    ).toBe("class Pool { static { var Worker = Custom; new Worker(a); } } new __mountlyWorker(b);");
  });

  it("scopes only the parts of a statement its bindings cover", ({ task }) => {
    story.init(task);
    story.given("heads evaluated outside, or inside, the scope a statement opens");

    story.then("a switch discriminant runs before the cases' bindings exist");
    expect(
      body('switch (new Worker(a).kind) { case "ready": const Worker = Custom; new Worker(b); }'),
    ).toBe(
      'switch (new __mountlyWorker(a).kind) { case "ready": const Worker = Custom; new Worker(b); }',
    );
    story.and("a catch default and a for-of head sit outside their body blocks");
    expect(body("try {} catch ({ a = new Worker(u) }) { const Worker = 1; }")).toBe(
      "try {} catch ({ a = new __mountlyWorker(u) }) { const Worker = 1; }",
    );
    expect(body("for (const x of new Worker(u)) { const Worker = 1; }")).toBe(
      "for (const x of new __mountlyWorker(u)) { const Worker = 1; }",
    );
    story.and("but a for-of head sees its own loop binding, so it is the local Worker");
    expect(shimWorkers("for (const Worker of new Worker(u).list) {}")).toBeNull();
  });

  it("reads what a pattern binds, not its keys", ({ task }) => {
    story.init(task);
    story.given("destructuring that renames Worker, and an import alias");

    story.then("neither binds Worker, so the real call is still rerouted");
    expect(body("const { Worker: CustomWorker } = pool; new Worker(u);")).toBe(
      "const { Worker: CustomWorker } = pool; new __mountlyWorker(u);",
    );
    expect(body('import { Worker as Pooled } from "./pool"; new Worker(u);')).toBe(
      'import { Worker as Pooled } from "./pool"; new __mountlyWorker(u);',
    );
    story.and("a destructuring that does bind Worker shadows it");
    expect(shimWorkers("const { Worker } = pool; new Worker(u);")).toBeNull();
    expect(shimWorkers("const { ...Worker } = pool; new Worker(u);")).toBeNull();
  });

  it("does nothing when there is no platform worker to reroute", ({ task }) => {
    story.init(task);
    story.given("no worker, a worker only in a string, and a chunk with its own Worker class");

    expect(shimWorkers("const a = 1;")).toBeNull();
    expect(shimWorkers('const tip = "new Worker(url)";')).toBeNull();
    expect(shimWorkers("class Worker {}\nnew Worker();")).toBeNull();
    expect(shimWorkers('import { Worker } from "./pool";\nnew Worker();')).toBeNull();
  });
});
