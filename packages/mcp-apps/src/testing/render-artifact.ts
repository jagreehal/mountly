import type { ConformanceDiagnostic, McpAppArtifact } from "../artifact/index.js";

interface FrameLike {
  url(): string;
  evaluate<T>(fn: () => T): Promise<T>;
}

interface PageLike {
  on(event: "pageerror", handler: (error: Error) => void): void;
  goto(url: string): Promise<unknown>;
  frames(): FrameLike[];
}

export interface ConformanceBrowser {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

export interface ConformanceHost {
  hostUrl: string;
  close(): Promise<void>;
}

/** @internal Test seam for browser and host lifecycle failures. */
export interface RenderMcpAppArtifactDependencies {
  launchBrowser(): Promise<ConformanceBrowser | undefined>;
  startHost(artifact: McpAppArtifact): Promise<ConformanceHost>;
}

function error(code: string, message: string, source: string): ConformanceDiagnostic {
  return { severity: "error", code, message, source };
}

/** Playwright is an optional peer — absent is a diagnostic, not a crash. */
async function launchBrowser(): Promise<ConformanceBrowser | undefined> {
  // Both specifiers are tried: under an isolated `node_modules` a project that
  // installed `@playwright/test` cannot resolve bare `playwright`, even though
  // one depends on the other. Specifiers stay `string`-typed so the optional
  // peer is optional at type-check time as well as at runtime.
  const specifiers: string[] = ["playwright", "@playwright/test"];
  for (const specifier of specifiers) {
    let mod: { chromium?: { launch(): Promise<ConformanceBrowser> } };
    try {
      mod = (await import(specifier)) as typeof mod;
    } catch {
      continue;
    }
    if (mod.chromium) return mod.chromium.launch();
  }
  return undefined;
}

async function startHost(artifact: McpAppArtifact): Promise<ConformanceHost> {
  const { startDevHost } = await import("../dev/index.js");
  return startDevHost({
    htmlPath: artifact.htmlPath,
    fixtures: { conformance: {} },
    hostPort: 5480,
  });
}

/**
 * Exercise an App artifact through the real two-origin host and browser.
 * Browser and host ownership stays local so every startup path is cleaned up.
 */
export async function renderMcpAppArtifactWith(
  artifact: McpAppArtifact,
  dependencies: RenderMcpAppArtifactDependencies,
): Promise<ConformanceDiagnostic[]> {
  let browser: ConformanceBrowser | undefined;
  try {
    browser = await dependencies.launchBrowser();
  } catch (caught) {
    return [
      error(
        "render/unavailable",
        `could not launch Chromium: ${caught instanceof Error ? caught.message : String(caught)}`,
        artifact.htmlPath,
      ),
    ];
  }
  if (!browser) {
    return [
      error(
        "render/unavailable",
        "render requested but Playwright is not installed (npm i -D playwright)",
        artifact.htmlPath,
      ),
    ];
  }

  let host: ConformanceHost | undefined;
  const failures: ConformanceDiagnostic[] = [];
  try {
    host = await dependencies.startHost(artifact);
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (caught) => pageErrors.push(caught.message));
    await page.goto(host.hostUrl);

    const deadline = Date.now() + 20_000;
    let mounted = false;
    let renderedContent = false;
    let mountedAt: number | undefined;
    let boundary: string | undefined;
    while (!boundary && Date.now() < deadline && pageErrors.length === 0) {
      const view = page.frames().find((frame) => frame.url().includes("srcdoc"));
      const state = view
        ? await view
            .evaluate(() => {
              const failed = document.querySelector("[data-mountly-mcp-error]");
              const root = document.querySelector("#mountly-mcp-root");
              const bounds = root?.getBoundingClientRect();
              return {
                state: root?.getAttribute("data-mountly-mcp-state") ?? undefined,
                html: root?.innerHTML ?? "",
                shadowHtml: root?.shadowRoot?.innerHTML ?? "",
                visibleHeight: bounds?.height ?? 0,
                error: failed
                  ? `${failed.getAttribute("data-mountly-mcp-error") ?? ""}: ${failed.textContent ?? ""}`
                  : undefined,
              };
            })
            .catch(() => undefined)
        : undefined;
      boundary = state?.error;
      // Sticky: the bridge's state only moves forward, and a View that mounted
      // stays mounted even if a later poll reads the frame mid-navigation.
      mounted ||= state?.state === "mounted";
      if (mounted && mountedAt === undefined) mountedAt = Date.now();
      renderedContent =
        (state?.html ?? "").trim().length > 0 ||
        (state?.shadowHtml ?? "").trim().length > 0 ||
        (state?.visibleHeight ?? 0) > 0;
      if (mounted && renderedContent) break;
      // Framework renderers may commit after mount() returns. Give them a
      // bounded window while still failing a genuinely empty View quickly.
      if (mountedAt !== undefined && Date.now() - mountedAt >= 2_000) break;
      await new Promise((done) => setTimeout(done, 100));
    }

    if (boundary) {
      failures.push(
        error("render/error-boundary", `View rendered an error: ${boundary}`, artifact.htmlPath),
      );
    } else if (pageErrors.length > 0) {
      failures.push(
        error("render/threw", `View threw while loading: ${pageErrors[0]}`, artifact.htmlPath),
      );
    } else if (!mounted) {
      failures.push(
        error(
          "render/timeout",
          "View never mounted: the handshake or widget mount did not complete",
          artifact.htmlPath,
        ),
      );
    } else if (!renderedContent) {
      failures.push(
        error("render/blank", "View mounted but rendered no content", artifact.htmlPath),
      );
    }
  } catch (caught) {
    failures.push(
      error(
        "render/failed",
        caught instanceof Error ? caught.message : String(caught),
        artifact.htmlPath,
      ),
    );
  } finally {
    await Promise.allSettled([browser.close(), host?.close() ?? Promise.resolve()]);
  }
  return failures;
}

export function renderMcpAppArtifact(artifact: McpAppArtifact): Promise<ConformanceDiagnostic[]> {
  return renderMcpAppArtifactWith(artifact, { launchBrowser, startHost });
}
