import { type LanguageModel, streamText } from "ai";
import {
  type Catalog,
  type Spec,
  type SpecValidationIssues,
  type UIElement,
  autoFixSpec,
  buildUserPrompt,
  validateSpec,
} from "@json-render/core";
import { compileTextStreamToSpecs } from "./spec-stream.js";

// The pure stream driver lives in `./spec-stream` (no AI-SDK coupling); re-export
// it here so it sits next to `streamSpec` for server-side consumers.
export { compileTextStreamToSpecs } from "./spec-stream.js";

// Ports of unreleased upstream json-render fixes (on main past v0.19.0); both
// become redundant — delete them here — once `@json-render/core` is bumped
// past 0.19.0.

// vercel-labs/json-render#299: models omit `children` on roughly a third of
// first attempts, and the schema requires it. Upstream adds this rule to the
// default catalog prompt; until that ships we append it ourselves.
export const REQUIRED_FIELDS_RULE =
  'REQUIRED FIELDS: Every element MUST include a "children" array. Leaf elements (text, badges, inputs, images) use an empty array: "children": [].' +
  ' Omitting "children" fails validation.';

/**
 * vercel-labs/json-render#300: drop children references to elements the model
 * never defined — the dominant first-attempt validation failure, and one
 * models rarely repair even when told. The renderer already skips missing
 * children at runtime, so pruning renders identically while letting the spec
 * validate. A repeat container is never pruned to zero children: that would
 * trade `missing_child` for `repeat_without_children` and hide the real
 * problem (the missing template).
 */
export function pruneDanglingChildren(spec: Spec, fixes: string[]): Spec {
  const elements = spec.elements as Record<string, UIElement>;
  const pruned: Record<string, UIElement> = { ...elements };
  for (const [key, element] of Object.entries(elements)) {
    if (!element.children || element.children.length === 0) continue;
    const present = element.children.filter((child) => child in elements);
    if (present.length === element.children.length) continue;
    if (element.repeat !== undefined && present.length === 0) continue;
    for (const child of element.children) {
      if (!(child in elements)) {
        fixes.push(`Removed reference to undefined element "${child}" from children of "${key}".`);
      }
    }
    pruned[key] = { ...element, children: present };
  }
  return { ...spec, elements: pruned };
}

export interface StreamSpecOptions {
  /** The catalog the spec must conform to (drives the system prompt). */
  catalog: Catalog;
  /** Any AI SDK model — `ollama(...)`, `google(...)`, `groq(...)`, etc. */
  model: LanguageModel;
  /** The natural-language UI request. */
  prompt: string;
  /** Optional runtime state to ground the generation. */
  state?: Record<string, unknown>;
  /** Sampling temperature. Default 0.2 — low for consistent JSONL output. */
  temperature?: number;
}

export interface SpecResult {
  /** The compiled, repaired spec. */
  spec: Spec;
  /** Raw model output (JSONL patches). */
  raw: string;
  /** Repairs applied: `autoFixSpec` (props-vs-element fields) plus {@link pruneDanglingChildren} (dangling child refs). */
  fixes: string[];
  /** Validation issues against the catalog. */
  issues: SpecValidationIssues;
}

/**
 * The handle {@link streamSpec} returns — one object, two ways to consume it
 * (mirrors the AI SDK's `streamText` result):
 *
 * - **iterate** `partialSpecStream` to watch the UI build itself, element by
 *   element, as the model emits patches;
 * - **await** `spec` (or `result` for everything) for the final, repaired spec
 *   — no need to touch the stream.
 *
 * The model request starts immediately; the promises resolve when it completes,
 * whether or not you iterate the stream.
 */
export interface SpecStream {
  /** Live: each value is the progressively-built spec (the UI assembling itself). */
  partialSpecStream: AsyncIterable<Spec>;
  /** The final repaired + validated result. */
  result: Promise<SpecResult>;
  /** Convenience: the final repaired spec only. */
  spec: Promise<Spec>;
  /** Convenience: the raw JSONL the model emitted. */
  raw: Promise<string>;
}

/**
 * Generate a catalog-constrained json-render spec from any AI SDK model — the
 * one entry point for turning a prompt into UI.
 *
 * Uses `streamText` + json-render's stream compiler (no JSON-mode or
 * tool-calling, so a small local model can drive it). The returned
 * {@link SpecStream} is both **awaitable** for the final spec and **iterable**
 * for the live build:
 *
 * ```ts
 * import { streamSpec } from "mountly-mcp/json-render/server";
 * import { ollama } from "ai-sdk-ollama";
 *
 * // Blocking (e.g. an MCP tool returning structuredContent):
 * const { spec } = await streamSpec({ catalog, model: ollama("granite4.1:3b"), prompt }).result;
 *
 * // Live (watch it build):
 * const ui = streamSpec({ catalog, model, prompt });
 * for await (const partial of ui.partialSpecStream) render(partial);
 * const { spec, issues } = await ui.result;
 * ```
 *
 * The promise rejects if the model never produces a spec with a resolvable root.
 */
export function streamSpec(options: StreamSpecOptions): SpecStream {
  const { catalog, model, prompt, state, temperature = 0.2 } = options;

  // Async queue: the eager pump pushes partial specs; the iterator drains them.
  const queue: Spec[] = [];
  let done = false;
  let failure: unknown = null;
  let wake: (() => void) | null = null;
  const ping = () => {
    wake?.();
    wake = null;
  };

  let resolveResult!: (r: SpecResult) => void;
  let rejectResult!: (e: unknown) => void;
  const result = new Promise<SpecResult>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });
  // The error also surfaces through the stream / `result`; don't let the base
  // promise trip an unhandledRejection if a caller reads neither.
  void result.catch(() => {});

  // Start the model request immediately (AI SDK semantics), pumping partials
  // into the queue and resolving the promises when it settles.
  void (async () => {
    let raw = "";
    try {
      const stream = streamText({
        model,
        system: `${catalog.prompt({ mode: "standalone" })}\n\n${REQUIRED_FIELDS_RULE}`,
        prompt: buildUserPrompt({ prompt, state }),
        temperature,
      });
      const text = (async function* () {
        for await (const delta of stream.textStream) {
          raw += delta;
          yield delta;
        }
      })();

      const driver = compileTextStreamToSpecs(text);
      let step = await driver.next();
      while (!step.done) {
        queue.push(step.value);
        ping();
        step = await driver.next();
      }
      const compiled = (step.value ?? {}) as Spec;

      // Guard before autoFixSpec: a small model can emit patches that never
      // scaffold a resolvable root. autoFixSpec would throw a cryptic
      // `Object.entries(undefined)`; fail with a clear message instead.
      if (
        typeof compiled.root !== "string" ||
        !compiled.elements ||
        !compiled.elements[compiled.root]
      ) {
        throw new Error(
          "mountly-mcp/json-render: model did not produce a valid spec (no resolvable root element)",
        );
      }

      const { spec: repaired, fixes } = autoFixSpec(compiled as unknown as Spec);
      const spec = pruneDanglingChildren(repaired, fixes);
      // A final snapshot with repairs applied, so a live renderer settles on the
      // same spec the awaiting caller receives.
      queue.push(spec);
      resolveResult({ spec, raw, fixes, issues: validateSpec(spec) });
    } catch (error) {
      failure = error;
      rejectResult(error);
    } finally {
      done = true;
      ping();
    }
  })();

  async function* partialSpecStream(): AsyncGenerator<Spec> {
    let i = 0;
    while (true) {
      // Bounded by queue.length above, so the index is always populated.
      while (i < queue.length) yield queue[i++] as Spec;
      if (done) {
        if (failure) throw failure;
        return;
      }
      await new Promise<void>((res) => {
        wake = res;
      });
    }
  }

  return {
    partialSpecStream: { [Symbol.asyncIterator]: partialSpecStream },
    result,
    // Getters so an unread convenience promise can't trip unhandledRejection.
    get spec() {
      return result.then((r) => r.spec);
    },
    get raw() {
      return result.then((r) => r.raw);
    },
  };
}
