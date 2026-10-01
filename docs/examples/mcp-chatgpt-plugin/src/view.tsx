import { createMcpView, useHostStyles, useToolResult } from "mountly-mcp/react";
import { useOpenAIExtensions } from "mountly-mcp/react/openai";

interface Deploy {
  id: string;
  app: string;
  status: "ok" | "failed";
  at: string;
}

type Content = { kind: "board"; deploys: Deploy[] } | { kind: "log"; name: string; uri: string };

const styles = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif;
  background: var(--color-background-primary, #fff); color: var(--color-text-primary, #171717); }
body { margin: 0; padding: 16px; }
h1 { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px;
  border: 1px solid var(--color-border-primary, #e5e5e5); border-radius: 8px; }
.muted { color: var(--color-text-secondary, #737373); font-size: 13px; }
.failed { color: #c2410c; font-weight: 600; }
`;

function DeployBoard() {
  useHostStyles();
  const content = useToolResult<{ structuredContent?: Content }>()?.structuredContent;
  // ChatGPT-only; undefined in every other host.
  const deepLink = useOpenAIExtensions().deepLink.getCurrent();

  if (content?.kind === "log") {
    return (
      <section>
        <h1>{content.name}</h1>
        <p className="muted">Opened from ChatGPT's file viewer · {content.uri}</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Deploys</h1>
      {/* A plain sidebar open reports "/". */}
      {deepLink && deepLink.url !== "/" && <p className="muted">Opened via {deepLink.url}</p>}
      <ul>
        {(content?.deploys ?? []).map((d) => (
          <li key={d.id}>
            <span>
              <strong>{d.app}</strong> <span className="muted">{d.id}</span>
            </span>
            <span className={d.status === "failed" ? "failed" : "muted"}>
              {d.status} · {new Date(d.at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

createMcpView(DeployBoard, { shadow: true, styles });
