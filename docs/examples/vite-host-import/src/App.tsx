import { lazy, Suspense, useEffect, useState } from "react";

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
      <h1>Vite host — import remotes</h1>
      <p>
        Whole widget: <code>import(&quot;demo-widget&quot;)</code>
      </p>
      <pre data-testid="feature-exports">{featureKeys.join(", ")}</pre>
      <p>
        Subpath: <code>import(&quot;demo-widget/Badge&quot;)</code>
      </p>
      <Suspense fallback={<p>Loading subpath…</p>}>
        <RemoteBadge />
      </Suspense>
    </main>
  );
}
