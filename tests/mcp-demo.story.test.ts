import { story } from "executable-stories-vitest";
import { describe, it, expect } from "vite-plus/test";
import { runVerification } from "../docs/examples/mcp-app-demo/verify.mjs";

describe("mcp-app-demo", () => {
  it("runs end-to-end MCP verification flow", async ({ task }) => {
    story.init(task);

    story.given("the mcp-app-demo builds a ui:// resource and starts an in-process MCP server");
    story.when("the verifier runs listTools/listResources/readResource/callTool checks");
    story.then("all MCP app demo assertions pass");
    await expect(runVerification()).resolves.toBeUndefined();
  });
});
