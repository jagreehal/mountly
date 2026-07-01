import { lazy, Suspense, useEffect, useState } from "react";

// Resolved at runtime through the import map the host plugin injected from the remote's URL.
// Types come from the host-generated declarations (see remotes.d.ts).
const RemoteBadge = lazy(() => import("demo-widget/Badge").then((mod) => ({ default: mod.Badge })));

export function App() {
  const [featureKeys, setFeatureKeys] = useState<string[]>([]);

  useEffect(() => {
    void import("demo-widget").then((mod) => {
      setFeatureKeys(Object.keys(mod));
    });
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Vite host — remotes by URL</h1>
      <p>
        The remote was declared as <code>{'remotes: { "demo-widget": url }'}</code> — the host
        fetched its fragment from that URL at build time.
      </p>
      <pre data-testid="feature-exports">{featureKeys.join(", ")}</pre>
      <Suspense fallback={<p>Loading subpath…</p>}>
        <RemoteBadge />
      </Suspense>
    </main>
  );
}
