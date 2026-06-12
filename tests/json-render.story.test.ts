import { createSpecStreamCompiler } from "@json-render/core";
import type { Spec } from "@json-render/core";
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi } from "vitest";
import {
  compileTextStreamToSpecs,
  parseSpecStreamLine,
  specToPatchLines,
} from "../packages/adapters/mountly-json-render/src/spec-stream";
import { defaultActionRouter } from "../packages/adapters/mountly-json-render/src/widget";

// A tiny dashboard spec in the shape json-render's Renderer consumes:
// { root, state, elements: { key: { type, props, children? } } }.
const SPEC = {
  root: "root",
  state: { region: "overview" },
  elements: {
    root: { type: "Stack", props: { gap: 16 }, children: ["heading", "card"] },
    heading: { type: "Heading", props: { text: "Revenue overview" } },
    card: { type: "Card", props: { title: "MRR" }, children: ["stat"] },
    stat: { type: "Stat", props: { label: "MRR", value: "$48.2k" } },
  },
} as unknown as Spec;

describe("mountly-json-render spec stream", () => {
  it("emits patch lines parent-before-child with scaffold/state/root first", ({
    task,
  }) => {
    story.init(task);

    story.given("a finished dashboard spec");
    story.json({ label: "Spec", value: SPEC });

    story.when("it is turned into json-render patch lines");
    const lines = specToPatchLines(SPEC);
    const patches = lines.map((l) => parseSpecStreamLine(l) as { path: string });

    story.then("the first three patches scaffold elements, state, then root");
    expect(patches.slice(0, 3).map((p) => p.path)).toEqual([
      "/elements",
      "/state",
      "/root",
    ]);

    story.then("every element is added after its parent (breadth-first)");
    const order = patches
      .map((p) => p.path)
      .filter((p) => p.startsWith("/elements/"));
    expect(order).toEqual([
      "/elements/root",
      "/elements/heading",
      "/elements/card",
      "/elements/stat",
    ]);

    story.but("every line is still valid standalone JSON");
    expect(() => lines.forEach((l) => JSON.parse(l))).not.toThrow();
  });

  it("round-trips a spec through the patch stream unchanged", ({ task }) => {
    story.init(task);

    story.given("the patch lines for the spec");
    const lines = specToPatchLines(SPEC);

    story.when("they are replayed through json-render's stream compiler");
    const compiler = createSpecStreamCompiler<Spec>();
    for (const line of lines) compiler.push(`${line}\n`);
    const rebuilt = compiler.getResult();

    story.then("the reconstructed spec deep-equals the original");
    expect(rebuilt).toEqual(SPEC);
  });

  it("escapes JSON-pointer special chars (~ and /) in element keys", ({
    task,
  }) => {
    story.init(task);

    story.given("a spec whose element keys contain '/' and '~'");
    const tricky = {
      root: "a/b",
      elements: {
        "a/b": { type: "Stack", props: {}, children: ["c~d"] },
        "c~d": { type: "Text", props: { text: "ok" } },
      },
    } as unknown as Spec;

    story.when("it is streamed and replayed");
    const lines = specToPatchLines(tricky);

    story.then("keys are escaped per RFC-6901 (~1 for /, ~0 for ~)");
    expect(lines.some((l) => l.includes("/elements/a~1b"))).toBe(true);
    expect(lines.some((l) => l.includes("/elements/c~0d"))).toBe(true);

    story.and("the spec still round-trips back to the original keys");
    const compiler = createSpecStreamCompiler<Spec>();
    for (const line of lines) compiler.push(`${line}\n`);
    expect(compiler.getResult()).toEqual(tricky);
  });
});

// Yield `text` as a stream of chunks split at arbitrary byte boundaries — so a
// single JSONL patch line can straddle two chunks, the way a real model emits
// tokens. Models the live "token → patch → spec" path without an AI SDK.
async function* chunked(text: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
  }
}

describe("mountly-json-render live streaming", () => {
  it("builds the spec progressively as patches arrive, then returns the final", async ({
    task,
  }) => {
    story.init(task);

    story.given("a model's JSONL patch output, streamed in tiny chunks");
    // Reuse the patch encoding a live model would emit, chunked at 7 chars so
    // most lines straddle a boundary.
    const wire = `${specToPatchLines(SPEC).join("\n")}\n`;

    story.when("the chunks are compiled by `compileTextStreamToSpecs`");
    const snapshots: number[] = [];
    const gen = compileTextStreamToSpecs(chunked(wire, 7));
    let step = await gen.next();
    while (!step.done) {
      // Count elements present in each progressive snapshot.
      snapshots.push(Object.keys(step.value.elements ?? {}).length);
      step = await gen.next();
    }
    const final = step.value;

    story.then("each snapshot adds elements — the UI builds itself");
    expect(snapshots.length).toBeGreaterThan(1);
    expect(snapshots).toEqual([...snapshots].sort((a, b) => a - b));
    expect(snapshots.at(-1)).toBe(Object.keys(SPEC.elements).length);

    story.then("the generator returns the fully-compiled spec");
    expect(final).toEqual(SPEC);
  });

  it("handles a line split across the final chunk boundary", async ({ task }) => {
    story.init(task);

    story.given("patch output whose last line has no trailing newline");
    const wire = specToPatchLines(SPEC).join("\n"); // note: no trailing "\n"

    story.when("it is streamed and compiled");
    const gen = compileTextStreamToSpecs(chunked(wire, 5));
    let step = await gen.next();
    while (!step.done) step = await gen.next();

    story.then("the buffered final line is still flushed into the spec");
    expect(step.value).toEqual(SPEC);
  });
});

describe("mountly-json-render action bridge", () => {
  it("routes an `ask` action to the agent via App.sendMessage", ({ task }) => {
    story.init(task);

    story.given("a mock MCP host");
    const sendMessage = vi.fn();
    const mcp = { sendMessage } as unknown as Parameters<
      typeof defaultActionRouter
    >[2];

    story.when("a generated button fires `ask` with a prompt");
    defaultActionRouter("ask", { prompt: "Break down Q3 by region" }, mcp);

    story.then("a user turn is sent back to the model — the agent loop");
    expect(sendMessage).toHaveBeenCalledWith({
      role: "user",
      content: [{ type: "text", text: "Break down Q3 by region" }],
    });
  });

  it("ignores non-ask actions and empty/absent prompts", ({ task }) => {
    story.init(task);

    story.given("a mock MCP host");
    const sendMessage = vi.fn();
    const mcp = { sendMessage } as unknown as Parameters<
      typeof defaultActionRouter
    >[2];

    story.when("a non-`ask` action, an empty prompt, and no params arrive");
    defaultActionRouter("navigate", { prompt: "x" }, mcp);
    defaultActionRouter("ask", { prompt: "" }, mcp);
    defaultActionRouter("ask", undefined, mcp);

    story.then("nothing is sent to the agent");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
