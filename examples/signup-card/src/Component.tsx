/*
 * Replace this placeholder with your own React component.
 *
 * Keep the `export function SignupCard(props)` shape — mount.ts imports
 * it by name. The shape of `props` can be anything you want; it's handed
 * through from feature.mount(...) / feature.attach({ props }).
 */

interface SignupCardProps {
  data?: unknown;
  onClose?: () => void;
}

export function SignupCard({ data, onClose }: SignupCardProps) {
  return (
    <div className="rounded-xl border p-5" style={{
      background: "var(--surface)",
      color: "var(--text)",
      borderColor: "var(--border)",
    }}>
      <h2 className="mb-2 text-lg font-semibold">SignupCard</h2>
      <p className="text-sm opacity-70">
        This is a scaffold. Replace the body of <code>src/Component.tsx</code>
        with your own React.
      </p>
      <pre className="mt-3 overflow-auto rounded bg-black/5 p-2 text-xs">
        {JSON.stringify(data ?? null, null, 2)}
      </pre>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-3 rounded border px-3 py-1 text-sm"
          style={{ borderColor: "var(--border)" }}
        >
          Close
        </button>
      )}
    </div>
  );
}
