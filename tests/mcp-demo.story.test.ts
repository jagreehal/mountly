import { story } from "executable-stories-vitest";
import { describe, it } from "vitest";
import { runVerification } from "../examples/mcp-app-demo/verify.mjs";

describe("mcp-app-demo", () => {
  it("runs end-to-end MCP verification flow", async ({ task }) => {
    story.init(task);

    story.given("the mcp-app-demo builds a ui:// resource and starts an in-process MCP server");
    story.when("the verifier runs listTools/listResources/readResource/callTool checks");
    await runVerification();
    story.then("all MCP app demo assertions pass");
  });
});
