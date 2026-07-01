import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useSpecStream } from "mountly-mcp/json-render";
import { GeneratedUI } from "../src/registry.js";

/**
 * Streaming + self-driving generative UI — and almost no code.
 *
 * `useSpecStream` owns all the ceremony (json-render's compiler, the patch
 * replay, the loading flag, cancellation when the spec changes). Self-driving
 * is just `setView` in `onAction`: the hook re-streams the next view, cancelling
 * the current one. Everything below is the actual app.
 */
type Spec = { root: string; state?: Record<string, unknown>; elements: Record<string, unknown> };
const g = globalThis as { __SPECS__?: Record<string, Spec>; __FIRST__?: string };
const SPECS = g.__SPECS__ ?? {};
const FIRST = g.__FIRST__ ?? "overview";

function App() {
  const [view, setView] = useState(FIRST);
  const { spec, state, loading } = useSpecStream(SPECS[view] as never);

  return (
    <div className="gv-root">
      <GeneratedUI
        spec={spec as never}
        state={state}
        loading={loading}
        onAction={(_name, params) => {
          const prompt = String(params?.prompt ?? "").toLowerCase();
          setView(prompt.includes("overview") ? "overview" : "q3");
        }}
      />
    </div>
  );
}

createRoot(document.getElementById("app") as HTMLElement).render(<App />);
