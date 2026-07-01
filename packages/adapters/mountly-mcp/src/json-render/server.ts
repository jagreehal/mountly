import { type LanguageModel, streamText } from "ai";
import {
  type Catalog,
  type Spec,
  type SpecValidationIssues,
  autoFixSpec,
  buildUserPrompt,
  validateSpec,
} from "@json-render/core";
import { compileTextStreamToSpecs } from "./spec-stream.js";

// The pure stream driver lives in `./spec-stream` (no AI-SDK coupling); re-export
// it here so it sits next to `streamSpec` for server-side consumers.
export { compileTextStreamToSpecs } from "./spec-stream.js";

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
  /** Repairs `autoFixSpec` applied (props-vs-element fields, dangling refs). */
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
        system: catalog.prompt({ mode: "standalone" }),
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

      const { spec, fixes } = autoFixSpec(compiled as unknown as Spec);
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
