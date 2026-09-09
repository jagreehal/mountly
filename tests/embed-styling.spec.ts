/**
 * Embed styling: light-DOM host inheritance, CSS modules decoys, FOUC ordering,
 * and shadow isolation across React / Vue / Svelte.
 *
 * Follows playwright-cookbook: web-first assertions, no waitForTimeout,
 * landmark-then-absence, network gate via page.route.
 */
import { createServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "vite-plus";
import { defineElementsConfig } from "../packages/mountly-vite-plugin/src/embed";

const reactRoot = join(process.cwd(), "docs/examples/react-embed");
const mixedRoot = join(process.cwd(), "docs/examples/mixed-embed");

const listen = (server: Server) =>
  new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve(`http://127.0.0.1:${port}`);
    });
  });
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

async function serveDist(dist: string) {
  const provider = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      const data = await readFile(join(dist, path));
      res.setHeader("Content-Type", extname(path) === ".css" ? "text/css" : "text/javascript");
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  return { provider, providerUrl: await listen(provider) };
}

async function serveHost(html: string) {
  const host = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  });
  return { host, hostUrl: await listen(host) };
}

async function buildElements(
  options: Parameters<typeof defineElementsConfig>[0],
  outDir: string,
) {
  await rm(outDir, { recursive: true, force: true });
  const config = defineElementsConfig(options);
  await build({
    ...config,
    configFile: false,
    logLevel: "silent",
    build: { ...config.build, outDir },
  } as unknown as Parameters<typeof build>[0]);
}

test("light DOM lets host design tokens and selectors reach the component", async ({ page }) => {
  test.setTimeout(60000);
  const dist = join(reactRoot, "dist-light-host");
  await buildElements({ prefix: "acme", elements: "src/elements/*.tsx", root: reactRoot }, dist);
  const { provider, providerUrl } = await serveDist(dist);
  const { host, hostUrl } = await serveHost(
    `<!doctype html><html><head>` +
      `<style>` +
      `:root { --payments-color: rgb(10, 20, 30); }` +
      `acme-payments-summary section { outline: 3px solid rgb(1, 2, 3); }` +
      `</style>` +
      `<script type="module" src="${providerUrl}/embed.js"></script>` +
      `</head><body>` +
      `<acme-payments-summary balance="1250" currency="GBP"></acme-payments-summary>` +
      `</body></html>`,
  );

  try {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(hostUrl);
    const summary = page.locator("acme-payments-summary");
    const section = summary.locator("section");
    await expect(summary).toContainText("GBP 1250");
    await expect(section).toHaveCSS("color", "rgb(10, 20, 30)");
    await expect(section).toHaveCSS("outline-color", "rgb(1, 2, 3)");
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([close(provider), close(host)]);
    await rm(dist, { recursive: true, force: true });
  }
});

test("light DOM CSS modules keep a host decoy .summary rule from winning", async ({ page }) => {
  test.setTimeout(60000);
  const dist = join(reactRoot, "dist-css-modules");
  await buildElements({ prefix: "acme", elements: "src/elements/*.tsx", root: reactRoot }, dist);
  const { provider, providerUrl } = await serveDist(dist);
  const { host, hostUrl } = await serveHost(
    `<!doctype html><html><head>` +
      `<style>.summary { color: rgb(255, 0, 0) !important; padding: 99px !important; }</style>` +
      `<script type="module" src="${providerUrl}/embed.js"></script>` +
      `</head><body>` +
      `<acme-payments-summary balance="1250" currency="GBP"></acme-payments-summary>` +
      `</body></html>`,
  );

  try {
    await page.goto(hostUrl);
    const summary = page.locator("acme-payments-summary");
    const section = summary.locator("section");
    await expect(summary).toContainText("GBP 1250");
    await expect(section).toHaveCSS("color", "rgb(23, 37, 84)");
    await expect(section).toHaveCSS("padding-top", "16px");
    await expect(section).toHaveClass(/summary/i);
    await expect.poll(async () => (await section.getAttribute("class"))?.trim()).not.toBe(
      "summary",
    );
  } finally {
    await Promise.all([close(provider), close(host)]);
    await rm(dist, { recursive: true, force: true });
  }
});

test("shadow embed waits on CSS before paint and keeps host selectors out", async ({ page }) => {
  test.setTimeout(60000);
  const dist = join(reactRoot, "dist-shadow-fouc");
  await buildElements(
    { prefix: "acme", elements: "src/elements/*.tsx", root: reactRoot, shadow: true },
    dist,
  );
  const { provider, providerUrl } = await serveDist(dist);

  let cssRequested = false;
  let releaseCss!: () => void;
  const cssGate = new Promise<void>((resolve) => {
    releaseCss = resolve;
  });
  await page.route(`${providerUrl}/**/*.css`, async (route) => {
    cssRequested = true;
    await cssGate;
    await route.continue();
  });

  const { host, hostUrl } = await serveHost(
    `<!doctype html><html><head>` +
      `<style>section { padding: 99px !important; color: rgb(255, 0, 0) !important; }</style>` +
      `<script type="module" src="${providerUrl}/embed.js"></script>` +
      `</head><body>` +
      `<acme-payments-summary balance="1250" currency="GBP"></acme-payments-summary>` +
      `</body></html>`,
  );

  try {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(hostUrl);
    await page.evaluate(() => customElements.whenDefined("acme-payments-summary"));

    // Landmark: mount has asked for CSS while the gate still holds.
    await expect.poll(() => cssRequested).toBe(true);
    // Same-pass absence: content is not painted until CSS arrives.
    await expect(page.locator("acme-payments-summary")).not.toContainText("GBP 1250");

    releaseCss();

    const summary = page.locator("acme-payments-summary");
    const section = summary.locator("section");
    await expect(summary).toContainText("GBP 1250");
    await expect(section).toHaveCSS("padding", "16px");
    await expect(section).toHaveCSS("color", "rgb(23, 37, 84)");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector("acme-payments-summary [data-mountly-embed-root]")?.shadowRoot
              ?.adoptedStyleSheets.length ?? 0,
        ),
      )
      .toBe(1);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            [...document.querySelectorAll("link[rel=stylesheet]")].filter((node) =>
              (node.getAttribute("href") ?? "").includes("summary"),
            ).length,
        ),
      )
      .toBe(0);
    expect(errors).toEqual([]);
  } finally {
    releaseCss();
    await Promise.all([close(provider), close(host)]);
    await rm(dist, { recursive: true, force: true });
  }
});

test("light DOM paints with styles already applied (no unstyled flash)", async ({ page }) => {
  test.setTimeout(60000);
  const dist = join(reactRoot, "dist-light-fouc");
  await buildElements({ prefix: "acme", elements: "src/elements/*.tsx", root: reactRoot }, dist);
  const { provider, providerUrl } = await serveDist(dist);
  const { host, hostUrl } = await serveHost(
    `<!doctype html><html><head>` +
      `<script type="module" src="${providerUrl}/embed.js"></script>` +
      `</head><body>` +
      `<acme-payments-summary balance="1250" currency="GBP"></acme-payments-summary>` +
      `</body></html>`,
  );

  try {
    await page.goto(hostUrl);
    const summary = page.locator("acme-payments-summary");
    const section = summary.locator("section");
    // First time the summary text is present, module styles must already win.
    await expect(summary).toContainText("GBP 1250");
    await expect(section).toHaveCSS("color", "rgb(23, 37, 84)");
    await expect(section).toHaveCSS("padding-top", "16px");
  } finally {
    await Promise.all([close(provider), close(host)]);
    await rm(dist, { recursive: true, force: true });
  }
});

test("mixed-framework shadow build isolates each framework from host CSS", async ({ page }) => {
  test.setTimeout(90000);
  const dist = join(mixedRoot, "dist-shadow");
  await buildElements(
    {
      prefix: "acme",
      elements: "src/elements/*.{tsx,vue,svelte}",
      root: mixedRoot,
      shadow: true,
    },
    dist,
  );
  const { provider, providerUrl } = await serveDist(dist);
  const { host, hostUrl } = await serveHost(
    `<!doctype html><html><head>` +
      `<style>` +
      `p { color: rgb(255, 0, 0) !important; padding: 99px !important; }` +
      `:root { --react-embed-color: rgb(1, 1, 1); --vue-embed-color: rgb(2, 2, 2); --svelte-embed-color: rgb(3, 3, 3); }` +
      `</style>` +
      `<script type="module" src="${providerUrl}/embed.js"></script>` +
      `</head><body>` +
      `<acme-react-card balance="12" currency="GBP"></acme-react-card>` +
      `<acme-vue-panel label="cards" count="3"></acme-vue-panel>` +
      `<acme-svelte-list rows="7"></acme-svelte-list>` +
      `</body></html>`,
  );

  try {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(hostUrl);

    const react = page.getByTestId("react");
    const vue = page.getByTestId("vue");
    const svelte = page.getByTestId("svelte");
    await expect(react).toHaveText("react GBP 12");
    await expect(vue).toHaveText("vue cards 3");
    await expect(svelte).toHaveText("svelte 7");

    // Host's `p { color: red !important }` must not win inside the shadow root.
    // Custom properties still inherit; each component reads its own token.
    await expect(react).toHaveCSS("color", "rgb(1, 1, 1)");
    await expect(vue).toHaveCSS("color", "rgb(2, 2, 2)");
    await expect(svelte).toHaveCSS("color", "rgb(3, 3, 3)");
    await expect(react).toHaveCSS("padding-top", "8px");
    await expect(vue).toHaveCSS("padding-top", "8px");
    await expect(svelte).toHaveCSS("padding-top", "8px");

    await expect
      .poll(() =>
        page.evaluate(() => {
          const tags = ["acme-react-card", "acme-vue-panel", "acme-svelte-list"];
          return tags.every((tag) => {
            const root = document
              .querySelector(tag)
              ?.querySelector("[data-mountly-embed-root]")?.shadowRoot;
            return !!root && root.adoptedStyleSheets.length > 0;
          });
        }),
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          page.locator("link[rel=stylesheet]").evaluateAll((nodes) =>
            nodes.filter((node) => /\.css($|\?)/.test(node.getAttribute("href") ?? "")).length,
          ),
      )
      .toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([close(provider), close(host)]);
    await rm(dist, { recursive: true, force: true });
  }
});

test("mixed-framework light DOM receives host tokens per framework", async ({ page }) => {
  test.setTimeout(90000);
  const dist = join(mixedRoot, "dist-light-tokens");
  await buildElements(
    {
      prefix: "acme",
      elements: "src/elements/*.{tsx,vue,svelte}",
      root: mixedRoot,
    },
    dist,
  );
  const { provider, providerUrl } = await serveDist(dist);
  const { host, hostUrl } = await serveHost(
    `<!doctype html><html><head>` +
      `<style>` +
      `:root { --react-embed-color: rgb(11, 11, 11); --vue-embed-color: rgb(22, 22, 22); --svelte-embed-color: rgb(33, 33, 33); }` +
      `</style>` +
      `<script type="module" src="${providerUrl}/embed.js"></script>` +
      `</head><body>` +
      `<acme-react-card balance="12" currency="GBP"></acme-react-card>` +
      `<acme-vue-panel label="cards" count="3"></acme-vue-panel>` +
      `<acme-svelte-list rows="7"></acme-svelte-list>` +
      `</body></html>`,
  );

  try {
    await page.goto(hostUrl);
    await expect(page.getByTestId("react")).toHaveText("react GBP 12");
    await expect(page.getByTestId("react")).toHaveCSS("color", "rgb(11, 11, 11)");
    await expect(page.getByTestId("vue")).toHaveCSS("color", "rgb(22, 22, 22)");
    await expect(page.getByTestId("svelte")).toHaveCSS("color", "rgb(33, 33, 33)");
  } finally {
    await Promise.all([close(provider), close(host)]);
    await rm(dist, { recursive: true, force: true });
  }
});
