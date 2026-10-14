// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi } from "vite-plus/test";
import type { App } from "../packages/mcp-apps/src/bridge/index";
import { downloadFile } from "../packages/mcp-apps/src/download";

function fakeApp(capable: boolean) {
  const downloadFile = vi.fn(async () => ({ isError: false }));
  const app = {
    getHostCapabilities: () => (capable ? { downloadFile: {} } : {}),
    downloadFile,
  } as unknown as App;
  return { app, downloadFile };
}

describe("downloadFile", () => {
  it("asks a capable host to save the file, as an embedded resource", async ({ task }) => {
    story.init(task, { tags: ["mcp", "download"] });
    const { app, downloadFile: request } = fakeApp(true);

    story.when("a View downloads a CSV string and a binary Blob");
    await downloadFile(app, { name: "matches.csv", data: "a,b\n1,2", mimeType: "text/csv" });
    await downloadFile(app, {
      name: "out.xlsx",
      data: new Blob([new Uint8Array([1, 2, 3])], { type: "application/vnd.ms-excel" }),
    });

    story.then("text travels as text, bytes as base64, both named by the file URI");
    expect(request.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      {
        contents: [
          {
            type: "resource",
            resource: { uri: "file:///matches.csv", mimeType: "text/csv", text: "a,b\n1,2" },
          },
        ],
      },
      {
        contents: [
          {
            type: "resource",
            resource: {
              uri: "file:///out.xlsx",
              mimeType: "application/vnd.ms-excel",
              blob: "AQID",
            },
          },
        ],
      },
    ]);
  });

  it("reports a declined download as false", async ({ task }) => {
    story.init(task, { tags: ["mcp", "download"] });
    const { app, downloadFile: request } = fakeApp(true);
    request.mockResolvedValueOnce({ isError: true });
    expect(await downloadFile(app, { name: "x.txt", data: "x" })).toBe(false);
  });

  it("falls back to <a download> where the host has no ui/download-file", async ({ task }) => {
    story.init(task, { tags: ["mcp", "download"] });
    const { app, downloadFile: request } = fakeApp(false);
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
    const clicked: Array<{ href: string; download: string }> = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ href: this.href, download: this.download });
      });

    expect(await downloadFile(app, { name: "report.json", data: "{}" })).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(clicked).toEqual([{ href: "blob:fake", download: "report.json" }]);
    expect(document.querySelector("a")).toBeNull();
    click.mockRestore();
  });
});
