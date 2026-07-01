import { createSpecStreamCompiler } from "@json-render/core";
import type { Spec } from "@json-render/core";

// json-render's streaming primitives, re-exported so the consumer side
// (compile patches → progressive spec) is one import away.
export {
  compileSpecStream,
  createJsonRenderTransform,
  createSpecStreamCompiler,
  parseSpecStreamLine,
} from "@json-render/core";

/**
 * Drive json-render's stream compiler from a raw text stream of JSONL patches,
 * yielding the progressively-built spec after each complete line. This is the
 * live "model token → patch → spec" path, decoupled from any AI SDK so it can
 * drive a real model (see `streamSpec` in `mountly-mcp/json-render/server`), replay
 * a saved transcript, bridge a custom transport, or be unit-tested with a
 * hand-written stream. Buffers partial lines across chunk boundaries. The
 * generator's *return* value is the final compiled spec (before `autoFixSpec`).
 *
 * ```ts
 * for await (const partial of compileTextStreamToSpecs(result.textStream)) {
 *   render(partial); // each yield is one more element built
 * }
 * ```
 */
export async function* compileTextStreamToSpecs(
  textStream: AsyncIterable<string>,
): AsyncGenerator<Spec, Spec, void> {
  const compiler = createSpecStreamCompiler<Spec>();
  let buffer = "";
  for await (const delta of textStream) {
    buffer += delta;
    const lines = buffer.split("\n");
    // Keep the trailing partial line for the next chunk.
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const { result } = compiler.push(`${line}\n`);
      yield { ...result };
    }
  }
  if (buffer.trim()) {
    const { result } = compiler.push(`${buffer}\n`);
    yield { ...result };
  }
  return compiler.getResult();
}

/**
 * Turn a finished spec into json-render's streaming patch format — ordered
 * RFC-6902 JSONL lines (`/elements` scaffold, `/state`, `/root`, then each
 * element parent-before-child). Feed these to a `createSpecStreamCompiler` to
 * replay the build progressively, so a known spec streams in the same way a
 * live model would emit it. Pure spec work — no AI SDK dependency.
 */
export function specToPatchLines(spec: Spec): string[] {
  const lines: string[] = [JSON.stringify({ op: "add", path: "/elements", value: {} })];
  if (spec.state !== undefined) {
    lines.push(JSON.stringify({ op: "add", path: "/state", value: spec.state }));
  }
  lines.push(JSON.stringify({ op: "add", path: "/root", value: spec.root }));

  // Breadth-first from the root so parents stream before their children.
  const seen = new Set<string>();
  const queue = [spec.root];
  while (queue.length) {
    const key = queue.shift() as string;
    if (seen.has(key) || !spec.elements[key]) continue;
    seen.add(key);
    const el = spec.elements[key];
    const path = `/elements/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    lines.push(JSON.stringify({ op: "add", path, value: el }));
    for (const child of el.children ?? []) queue.push(child);
  }
  return lines;
}
