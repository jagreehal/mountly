import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  EXTENSION_ID,
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));

export const RESOURCE_URI = "ui://mountly-examples/release-readiness";
export const REVIEW_TOOL = "review_release";
export const DECISION_TOOL = "record_release_decision";

export function releaseReport({ service, environment }) {
  const production = environment === "production";
  return {
    releaseId: `rel_${service.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_042`,
    service,
    environment,
    commit: "8c1e2d4",
    owner: "Delivery Platform",
    window: production ? "Today · 21:00–21:30 UTC" : "Open now",
    readiness: production ? 68 : 92,
    recommendation: production ? "hold" : "ship",
    summary: production
      ? "One migration risk and an incomplete canary window need an explicit owner decision."
      : "All required staging checks are clear. The release is ready for its validation window.",
    checks: [
      {
        id: "error-budget",
        label: "Error budget",
        value: "71% remaining",
        detail: "Thirty-day burn is within the service policy.",
        state: "pass",
      },
      {
        id: "migration",
        label: "Schema migration",
        value: production ? "2 destructive statements" : "Dry run passed",
        detail: production
          ? "Rollback SQL exists, but the lock estimate exceeds the normal threshold."
          : "Migration completed against the staging dataset in 42 seconds.",
        state: production ? "block" : "pass",
      },
      {
        id: "canary",
        label: "Canary sample",
        value: production ? "8 of 15 minutes" : "15 minutes complete",
        detail: production
          ? "No regression detected so far; the minimum observation window is incomplete."
          : "Latency and error rate remained inside the baseline envelope.",
        state: production ? "watch" : "pass",
      },
      {
        id: "ownership",
        label: "Rollback owner",
        value: "Assigned",
        detail: "Delivery Platform is on call through the deployment window.",
        state: "pass",
      },
    ],
  };
}

export async function createReleaseServer(options = {}) {
  const htmlPath = options.htmlPath ?? join(here, "dist/release_readiness.html");
  const [html, declaration] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(`${htmlPath}.meta.json`, "utf8").then(JSON.parse),
  ]);

  const server = new McpServer(
    { name: "mountly-release-readiness", version: "0.0.1" },
    {
      capabilities: { resources: {}, tools: {} },
      extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
    },
  );

  registerAppResource(
    server,
    declaration.name,
    RESOURCE_URI,
    {
      description: declaration.description,
      mimeType: RESOURCE_MIME_TYPE,
      _meta: declaration._meta,
    },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: declaration._meta,
        },
      ],
    }),
  );

  registerAppTool(
    server,
    REVIEW_TOOL,
    {
      title: "Review release readiness",
      description: "Review preflight signals for a service release",
      inputSchema: {
        service: z.string().min(1),
        environment: z.enum(["staging", "production"]),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ service, environment }) => {
      const report = releaseReport({ service, environment });
      return {
        structuredContent: report,
        content: [
          {
            type: "text",
            text: `${service} is ${report.readiness}% ready; recommendation: ${report.recommendation}.`,
          },
        ],
      };
    },
  );

  registerAppTool(
    server,
    DECISION_TOOL,
    {
      title: "Record release decision",
      description: "Record an approval or hold from the interactive release view",
      inputSchema: {
        releaseId: z.string().min(1),
        decision: z.enum(["approve", "hold"]),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["app"] } },
    },
    async ({ releaseId, decision }) => ({
      structuredContent: { releaseId, decision, recorded: true },
      content: [{ type: "text", text: `${decision} recorded for ${releaseId}.` }],
    }),
  );

  return server;
}

// Default export so `mountly-mcp dev --server ./server.mjs` can drive real tools.
export default createReleaseServer;
