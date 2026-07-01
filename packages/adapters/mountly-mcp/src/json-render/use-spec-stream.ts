import { useEffect, useState } from "react";
import type { Spec } from "@json-render/core";
import { createSpecStreamCompiler } from "@json-render/core";
import { specToPatchLines } from "./spec-stream.js";

export interface UseSpecStreamOptions {
  /** Delay between patches, ms. Default 90. Set 0 to render instantly. */
  intervalMs?: number;
}

export interface SpecStreamState {
  /** The progressively-built spec (partial while streaming, full when done). */
  spec: Spec | null;
  /** Convenience: `spec?.state`, to pass straight to the renderer. */
  state: Record<string, unknown> | undefined;
  /** True while patches are still being applied. */
  loading: boolean;
}

/**
 * Replay a finished spec as a live json-render stream — and own all the
 * ceremony. Give it the target spec; it scaffolds a `createSpecStreamCompiler`,
 * replays the patches with a delay, exposes the partial spec + `loading` after
 * each step, and cancels cleanly when the target changes (so a self-driving UI
 * that swaps specs mid-stream just works). Re-streams whenever `target` changes.
 *
 * ```tsx
 * const { spec, state, loading } = useSpecStream(specs[view]);
 * return <Renderer spec={spec} state={state} loading={loading} onAction={...} />;
 * ```
 */
export function useSpecStream(
  target: Spec | null | undefined,
  options: UseSpecStreamOptions = {},
): SpecStreamState {
  const { intervalMs = 90 } = options;
  const [spec, setSpec] = useState<Spec | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!target) {
      setSpec(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const compiler = createSpecStreamCompiler<Spec>();
    const lines = specToPatchLines(target);
    setLoading(true);

    void (async () => {
      for (const line of lines) {
        if (cancelled) return;
        const { result } = compiler.push(`${line}\n`);
        setSpec({ ...result });
        if (intervalMs > 0) {
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      }
      if (cancelled) return;
      setSpec(compiler.getResult());
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [target, intervalMs]);

  return { spec, state: spec?.state, loading };
}
