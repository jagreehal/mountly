import { useCallback, useEffect, useMemo, useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import type { Spec } from "@json-render/core";
import { escapeInlineScript } from "../html.js";

export interface UseJsonRenderAppOptions {
  name: string;
  version: string;
}

export interface UseJsonRenderAppReturn {
  spec: Spec | null;
  loading: boolean;
  connected: boolean;
  connecting: boolean;
  error: Error | null;
  app: App | null;
  callServerTool: (name: string, args?: Record<string, unknown>) => Promise<void>;
}

type ToolResultPayload = {
  structuredContent?: { spec?: Spec } | Spec;
  content?: ReadonlyArray<{ type?: string; text?: string }>;
};

function isSpec(value: unknown): value is Spec {
  return !!value && typeof value === "object" && "root" in (value as Record<string, unknown>);
}

/**
 * Read the spec from a tool result in either wire format: Mountly's
 * `structuredContent`, or the JSON-in-`content[0].text` that
 * `@json-render/mcp` servers emit. Supporting both means this hook renders
 * a server built with either package.
 */
function pickSpec(payload: ToolResultPayload | undefined): Spec | null {
  const structured = payload?.structuredContent;
  if (isSpec(structured)) return structured;
  const nested = (structured as { spec?: Spec } | undefined)?.spec;
  if (nested) return nested;

  for (const part of payload?.content ?? []) {
    if (part?.type !== "text" || !part.text) continue;
    try {
      const parsed: unknown = JSON.parse(part.text);
      if (isSpec(parsed)) return parsed;
      const wrapped = (parsed as { spec?: unknown } | null)?.spec;
      if (isSpec(wrapped)) return wrapped;
    } catch {
      // Not a spec payload — hosts also send plain prose here.
    }
  }
  return null;
}

export function useJsonRenderApp(options: UseJsonRenderAppOptions): UseJsonRenderAppReturn {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [app, setApp] = useState<App | null>(null);

  useEffect(() => {
    const current = new App({ name: options.name, version: options.version }, {});
    setApp(current);
    setConnecting(true);
    setConnected(false);
    setError(null);

    const onToolResult = (params: ToolResultPayload) => {
      const next = pickSpec(params);
      if (next) setSpec(next);
      setLoading(false);
    };
    current.addEventListener("toolresult", onToolResult);

    void current
      .connect()
      .then(() => {
        setConnected(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        setConnecting(false);
      });

    return () => {
      current.removeEventListener("toolresult", onToolResult);
      void current.close().catch(() => undefined);
    };
  }, [options.name, options.version]);

  const callServerTool = useCallback(
    async (name: string, args?: Record<string, unknown>) => {
      if (!app) throw new Error("json-render app is not connected yet");
      setLoading(true);
      const result = (await app.callServerTool({
        name,
        arguments: args ?? {},
      })) as ToolResultPayload;
      const next = pickSpec(result);
      if (next) setSpec(next);
      setLoading(false);
    },
    [app],
  );

  return useMemo(
    () => ({
      spec,
      loading,
      connected,
      connecting,
      error,
      app,
      callServerTool,
    }),
    [spec, loading, connected, connecting, error, app, callServerTool],
  );
}

export interface BuildAppHtmlOptions {
  title?: string;
  js: string;
  css?: string;
}

export function buildAppHtml(options: BuildAppHtmlOptions): string {
  const title = options.title ?? "json-render MCP App";
  const css = options.css ?? "";
  const js = escapeInlineScript(options.js);
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${title}</title>`,
    css ? `  <style>${css}</style>` : "",
    "</head>",
    "<body>",
    '  <div id="root"></div>',
    `  <script type="module">${js}</script>`,
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
}
