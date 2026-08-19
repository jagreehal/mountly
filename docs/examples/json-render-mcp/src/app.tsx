import { createRoot } from "react-dom/client";
import { createRenderer } from "@json-render/react";
import { useJsonRenderApp } from "mountly-mcp/json-render/app";
import { catalog } from "./catalog.js";
import { components } from "./registry.js";

// One renderer for the catalog, built once at module scope.
const Dashboard = createRenderer(catalog, components);

/**
 * The iframe side of the MCP App. `useJsonRenderApp` performs the MCP Apps
 * handshake with the host, then hands us whatever spec the tool returned —
 * reading either wire format, so this same view also renders a server built
 * with `@json-render/mcp`.
 */
function View() {
  const { spec, connected, error } = useJsonRenderApp({
    name: "json-render-mcp-example",
    version: "1.0.0",
  });

  if (error) return <Status text={`Could not reach the MCP host: ${error.message}`} />;
  if (!connected) return <Status text="Connecting to the host…" />;
  if (!spec) return <Status text="Waiting for a tool result…" />;

  return <Dashboard spec={spec} state={spec.state} />;
}

function Status({ text }: { text: string }) {
  return <p style={{ margin: 0, color: "#6b7280", font: "14px system-ui, sans-serif" }}>{text}</p>;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <div style={{ font: "14px system-ui, sans-serif", padding: 20, background: "#f7f8fa" }}>
      <View />
    </div>,
  );
}
