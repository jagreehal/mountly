import { createApp } from "vue";
import { expect, test, vi } from "vitest";
import ReleaseReadiness from "../../docs/examples/mcp-release-readiness/src/ReleaseReadiness.vue";
import McpReleaseReadiness from "../../docs/examples/mcp-release-readiness/src/McpReleaseReadiness.vue";
import type {
  ReleaseDecision,
  ReleaseReport,
} from "../../docs/examples/mcp-release-readiness/src/types";
import { App, runBridge } from "../../packages/mcp-apps/dist/bridge/index.js";
import { createMcpWidget } from "../../packages/mcp-apps/dist/vue/index.js";

const report: ReleaseReport = {
  releaseId: "rel_checkout_api_042",
  service: "checkout-api",
  environment: "production",
  commit: "8c1e2d4",
  owner: "Delivery Platform",
  window: "Today · 21:00–21:30 UTC",
  readiness: 68,
  recommendation: "hold",
  summary: "One migration risk needs an explicit owner decision.",
  checks: [
    {
      id: "error-budget",
      label: "Error budget",
      value: "71% remaining",
      detail: "Thirty-day burn is within policy.",
      state: "pass",
    },
    {
      id: "migration",
      label: "Schema migration",
      value: "2 destructive statements",
      detail: "The lock estimate exceeds the normal threshold.",
      state: "block",
    },
  ],
};

test("the reusable release component renders without an MCP context", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const decide = vi.fn<(decision: ReleaseDecision) => void>();
  const app = createApp(ReleaseReadiness, { report, onDecide: decide });

  try {
    app.mount(container);

    expect(container.querySelector("h1")?.textContent).toContain("checkout-api");
    expect(container.textContent).toContain("2 destructive statements");
    expect(container.textContent).toContain("Hold for review");

    const approve = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Approve window"),
    );
    approve?.click();
    await Promise.resolve();

    expect(decide).toHaveBeenCalledWith("approve");
  } finally {
    app.unmount();
    container.remove();
  }
});

test("the MCP adapter renders tool data and calls the app-only decision tool", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const app = new App({ name: "release-component-test", version: "0" });
  const callServerTool = vi.spyOn(app, "callServerTool").mockResolvedValue({ content: [] });
  const bridge = runBridge({
    app,
    container,
    widget: createMcpWidget(McpReleaseReadiness),
  });
  await bridge.ready;

  const handlers = (
    app as unknown as {
      _notificationHandlers: Map<
        string,
        (notification: { method: string; params: unknown }) => void
      >;
    }
  )._notificationHandlers;
  handlers.get("ui/notifications/tool-result")?.({
    method: "ui/notifications/tool-result",
    params: { structuredContent: report },
  });

  try {
    await vi.waitFor(() =>
      expect(container.querySelector("h1")?.textContent).toContain("checkout-api"),
    );
    const approve = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Approve window"),
    );
    approve?.click();

    await vi.waitFor(() =>
      expect(callServerTool).toHaveBeenCalledWith({
        name: "record_release_decision",
        arguments: { releaseId: report.releaseId, decision: "approve" },
      }),
    );
    await vi.waitFor(() => expect(container.textContent).toContain("Approval recorded"));
  } finally {
    bridge.stop();
    container.remove();
  }
});
