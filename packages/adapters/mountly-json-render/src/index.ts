export {
  type ActionRouter,
  type GenerativeWidgetOptions,
  createGenerativeWidget,
  defaultActionRouter,
  defineComponents,
} from "./widget.js";

// Convenience re-exports for rendering the same catalog natively (non-MCP) —
// previews, tests, or a plain mountly feature. Pair with `mountly-react`'s
// `createWidget` to mount a spec outside an MCP host.
export { createRenderer } from "@json-render/react";
export type { ComponentMap, ComponentRenderProps } from "@json-render/react";

// Streaming primitives (json-render's own): replay a known spec as a patch
// stream, compile patches back into a progressively-built spec, and the AI-SDK
// transform that classifies a model's UI-message stream into spec patches.
export {
  compileSpecStream,
  compileTextStreamToSpecs,
  createJsonRenderTransform,
  createSpecStreamCompiler,
  parseSpecStreamLine,
  specToPatchLines,
} from "./spec-stream.js";
export type { Spec } from "@json-render/core";

// --- Two ways to stream ---
//
// Replay (known spec): `useSpecStream` takes a finished spec — e.g. the one an
// MCP tool delivered as `structuredContent` — and replays it as a live build,
// with the compiler, loading flag, and cancellation included.
export {
  type SpecStreamState,
  type UseSpecStreamOptions,
  useSpecStream,
} from "./use-spec-stream.js";

// Live (from a model): `useUIStream` / `useChatUI` are json-render's own client
// hooks — POST a prompt to an endpoint that streams JSONL patches (see
// `streamSpec` in `mountly-json-render/server`) and render the spec as it
// builds. Re-exported so the live path is one import away.
export { useChatUI, useUIStream } from "@json-render/react";
export type {
  UseUIStreamOptions,
  UseUIStreamReturn,
} from "@json-render/react";
