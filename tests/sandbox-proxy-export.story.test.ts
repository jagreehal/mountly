// @vitest-environment node
import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";

describe("sandbox proxy export", () => {
  it("sandboxProxyHtml returns a complete HTML document with the host origin", async ({ task }) => {
    story.init(task);

    story.given("sandboxProxyHtml imported from the sandbox subpath");
    const { sandboxProxyHtml } = await import("../packages/mcp-apps/src/sandbox/index");

    story.when("called with a host origin");
    const html = sandboxProxyHtml("https://host.example.com");

    story.then("it returns a full HTML page embedding the host origin");
    expect(html).toContain("<!doctype html");
    expect(html).toContain("https://host.example.com");
    expect(html).toContain("__mountlyMcpSandbox__");
    expect(html).toContain("<script>");
  });

  it("sandboxProxyHtml escapes the host origin to prevent XSS", async ({ task }) => {
    story.init(task);

    story.given("a malicious host origin containing script tags");
    const { sandboxProxyHtml } = await import("../packages/mcp-apps/src/sandbox/index");

    story.when("called with the malicious origin");
    const html = sandboxProxyHtml('https://evil.com"<script>alert(1)</script>');

    story.then("the script tag is escaped in the output");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
