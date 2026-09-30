/**
 * ChatGPT extension hook backed by `@openai/mcp-extensions/app`.
 * Separate entry (`mountly-mcp/react/openai`) keeps the peer out of ordinary Views.
 */
import { useContext, useRef } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { OpenAIExtensions } from "@openai/mcp-extensions/app";
import { McpContext } from "./context.js";

/**
 * Official ChatGPT extension surface for this View.
 * One `OpenAIExtensions` per App handle. Call `message`, `files`, `deepLink`, and the rest on the returned instance.
 */
export function useOpenAIExtensions(): OpenAIExtensions {
  const ctx = useContext(McpContext);
  if (!ctx) {
    throw new Error(
      "mountly-mcp/react: useOpenAIExtensions must be used inside a View wrapped with createMcpView().",
    );
  }
  const app = ctx.app;
  const ref = useRef<{ app: App; extensions: OpenAIExtensions } | null>(null);
  if (ref.current?.app !== app) {
    ref.current = { app, extensions: new OpenAIExtensions(app) };
  }
  return ref.current.extensions;
}
