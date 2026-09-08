import { createServer, type Server } from "node:http";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join, relative, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "vite-plus";
import { defineElementsConfig } from "../packages/mountly-vite-plugin/src/embed";

const root = join(process.cwd(), "docs/examples/react-embed");
const dist = join(root, "dist");
const listen = (server: Server) =>
  new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve(`http://127.0.0.1:${port}`);
    });
  });
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test("a script tag embeds React across origins with typed attributes, lazy chunks and events", async ({
  page,
}) => {
  test.setTimeout(60000);
  await build({
    ...defineElementsConfig({ prefix: "acme", elements: "src/elements/*.tsx", root }),
    configFile: false,
    logLevel: "silent",
  } as unknown as Parameters<typeof build>[0]);

  const requests: string[] = [];
  const provider = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    requests.push(path);
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      const data = await readFile(join(dist, path.replace("/releases/1.2.0/", "")));
      res.setHeader("Content-Type", extname(path) === ".css" ? "text/css" : "text/javascript");
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  const providerUrl = await listen(provider);
  const host = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><html><head><script type="module" src="${providerUrl}/releases/1.2.0/embed.js"></script></head><body><main></main></body></html>`,
    );
  });
  const hostUrl = await listen(host);

  try {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(hostUrl);
    await page.evaluate(() => customElements.whenDefined("acme-payments-summary"));

    // Registration downloads nothing but the embed itself.
    expect(requests).toEqual(["/releases/1.2.0/embed.js"]);

    await page.evaluate(() => {
      document.querySelector("main")!.innerHTML =
        `<acme-payments-summary balance="1250" currency="GBP">Loading…</acme-payments-summary>`;
      document.addEventListener("view-details", (event) => {
        document.body.dataset.selected = JSON.stringify((event as CustomEvent).detail);
      });
    });

    const summary = page.locator("acme-payments-summary");
    await expect.poll(() => summary.textContent()).toContain("GBP 1250");
    // The component's props type said `number`, so the attribute coerced.
    expect(
      await page.evaluate(() => [
        typeof (document.querySelector("acme-payments-summary") as Record<string, unknown>).balance,
        typeof (document.querySelector("acme-payments-summary") as Record<string, unknown>)
          .currency,
        typeof (document.querySelector("acme-payments-summary") as Record<string, unknown>).compact,
      ]),
    ).toEqual(["number", "string", "boolean"]);
    expect(requests.some((path) => path.includes("payment-methods"))).toBe(false);
    expect(requests.some((path) => path.endsWith(".css"))).toBe(true);
    expect(await page.locator("section").evaluate((el) => getComputedStyle(el).color)).toBe(
      "rgb(23, 37, 84)",
    );

    // A callback prop arrives as a bubbling DOM event.
    await page.getByRole("button", { name: "View details" }).click();
    expect(await page.locator("body").getAttribute("data-selected")).toBe('{"balance":1250}');

    // Properties are real accessors: assigning one re-renders without remounting.
    await page.evaluate(() => {
      const el = document.querySelector("acme-payments-summary") as HTMLElement & {
        balance: number;
        lineItems: unknown[];
      };
      el.balance = 1500;
      el.lineItems = [{ label: "Subscription", amount: 1200 }];
    });
    await expect.poll(() => summary.textContent()).toContain("GBP 1500");
    await expect.poll(() => summary.textContent()).toContain("Subscription: 1200");
    expect(
      await page.getByRole("button", { name: "View details" }).getAttribute("aria-expanded"),
    ).toBe("true");

    // A boolean attribute follows HTML: present is true.
    await page.evaluate(() =>
      document.querySelector("acme-payments-summary")!.setAttribute("compact", ""),
    );
    await expect
      .poll(() => page.locator("section").evaluate((el) => getComputedStyle(el).paddingTop))
      .toBe("4px");

    // A second instance and a second component share one framework chunk.
    await page.evaluate(() => {
      document
        .querySelector("main")!
        .insertAdjacentHTML(
          "beforeend",
          '<acme-payments-summary balance="7" currency="EUR"></acme-payments-summary><acme-payment-methods></acme-payment-methods>',
        );
    });
    await expect
      .poll(() => page.locator("acme-payment-methods").textContent())
      .toContain("Payment methods loaded");
    await expect.poll(() => summary.nth(1).textContent()).toContain("EUR 7");
    expect(
      requests.filter((path) => path.includes("payments-summary") && path.endsWith(".js")),
    ).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([close(provider), close(host)]);
  }
});

test("one build serves React, Vue and Svelte with no compiler configured", async ({ page }) => {
  test.setTimeout(60000);
  const mixedRoot = join(process.cwd(), "docs/examples/mixed-embed");

  // The config names no plugins at all; the build brings what these files need.
  await build({
    ...defineElementsConfig({
      prefix: "acme",
      elements: "src/elements/*.{tsx,vue,svelte}",
      root: mixedRoot,
    }),
    configFile: false,
    logLevel: "silent",
  } as unknown as Parameters<typeof build>[0]);

  const mixedDist = join(mixedRoot, "dist");
  const provider = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      const data = await readFile(join(mixedDist, path));
      res.setHeader("Content-Type", extname(path) === ".css" ? "text/css" : "text/javascript");
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  const providerUrl = await listen(provider);
  const host = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><html><head><script type="module" src="${providerUrl}/embed.js"></script></head><body><main></main></body></html>`,
    );
  });
  const hostUrl = await listen(host);

  try {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(hostUrl);
    await page.evaluate(() => customElements.whenDefined("acme-vue-panel"));
    await page.evaluate(() => {
      document.querySelector("main")!.innerHTML =
        `<acme-react-card balance="12" currency="GBP"></acme-react-card>` +
        `<acme-vue-panel label="cards" count="3"></acme-vue-panel>` +
        `<acme-svelte-list rows="7"></acme-svelte-list>`;
    });

    // Each framework's own component renders, with its attributes coerced.
    await expect.poll(() => page.getByTestId("react").textContent()).toBe("react GBP 12");
    await expect.poll(() => page.getByTestId("vue").textContent()).toBe("vue cards 3");
    await expect.poll(() => page.getByTestId("svelte").textContent()).toBe("svelte 7");

    // A Svelte property update reaches the component rather than being inert.
    await page.evaluate(() => {
      (document.querySelector("acme-svelte-list") as HTMLElement & { rows: number }).rows = 9;
    });
    await expect.poll(() => page.getByTestId("svelte").textContent()).toBe("svelte 9");

    expect(errors).toEqual([]);
  } finally {
    await Promise.all([close(provider), close(host)]);
  }
});

test("the build emits consumer types and a custom elements manifest", async () => {
  const types = await readFile(join(dist, "embed.d.ts"), "utf8");

  // Typed tags in JSX and in plain DOM code, straight from the component's props.
  expect(types).toContain(`"acme-payments-summary": AcmePaymentsSummaryElement;`);
  expect(types).toContain(
    "interface AcmePaymentsSummaryElement extends MountlyElement<AcmePaymentsSummaryProps>",
  );
  expect(types).toContain("balance?: number;");
  expect(types).toContain("currency?: string;");
  expect(types).toContain("compact?: boolean;");
  expect(types).toContain("lineItems?: unknown;");
  expect(types).toContain(`"view-details": CustomEvent;`);
  // Typed addEventListener is the point of the event map.
  expect(types).toContain("keyof AcmePaymentsSummaryEventMap");
  expect(types).toContain("namespace JSX");
  // Callback props are events, never attributes.
  expect(types).not.toContain("onViewDetails?:");

  // A script-tag consumer must not need the mountly package just for types.
  expect(types).not.toContain('from "mountly');

  const manifest = JSON.parse(await readFile(join(dist, "custom-elements.json"), "utf8"));
  expect(manifest.schemaVersion).toBe("1.0.0");
  const summary = manifest.modules
    .flatMap((module: { declarations: unknown[] }) => module.declarations)
    .find((declaration: { tagName?: string }) => declaration.tagName === "acme-payments-summary");
  expect(summary.customElement).toBe(true);
  expect(summary.attributes.map((a: { name: string }) => a.name)).toEqual([
    "balance",
    "currency",
    "compact",
    "line-items",
  ]);
  expect(summary.events).toEqual([{ name: "view-details", type: { text: "CustomEvent" } }]);
});

test("a React host type-checks the tags in real JSX", async () => {
  const dir = join(dist, "..", "types-check-react");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await cp(join(dist, "embed.d.ts"), join(dir, "embed.d.ts"));
  await cp(join(dist, "embed.react.d.ts"), join(dir, "embed.react.d.ts"));
  const toRoot = relative(dir, process.cwd()).split(sep).join("/");
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "esnext",
        moduleResolution: "bundler",
        lib: ["dom", "esnext"],
        jsx: "react-jsx",
        skipLibCheck: true,
        // TypeScript 7 removed baseUrl, so paths are relative to this file.
        paths: {
          react: [`${toRoot}/node_modules/@types/react`],
          "react/*": [`${toRoot}/node_modules/@types/react/*`],
        },
      },
      files: ["embed.react.d.ts", "consumer.tsx"],
    }),
  );

  const tsc = (source: string) =>
    new Promise<{ code: number; out: string }>((resolve) => {
      void writeFile(join(dir, "consumer.tsx"), source).then(() => {
        const proc = spawn("pnpm", ["exec", "tsc", "-p", dir], { cwd: process.cwd() });
        let out = "";
        proc.stdout.on("data", (chunk) => (out += chunk));
        proc.stderr.on("data", (chunk) => (out += chunk));
        proc.on("close", (code) => resolve({ code: code ?? 1, out }));
      });
    });

  // The exact snippet the guide tells React hosts to write.
  const good = await tsc(`
    export function Page() {
      return <acme-payments-summary balance={1250} currency="GBP" compact />;
    }
  `);
  expect(good.out).toBe("");
  expect(good.code).toBe(0);

  const bad = await tsc(`
    export function Page() {
      return <acme-payments-summary balance="lots" />;
    }
  `);
  expect(bad.code).not.toBe(0);
  expect(bad.out).toContain("not assignable");

  await rm(dir, { recursive: true, force: true });
});

test("consumer code type-checks against the generated declarations", async () => {
  const dir = join(dist, "..", "types-check");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await cp(join(dist, "embed.d.ts"), join(dir, "embed.d.ts"));
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "esnext",
        moduleResolution: "bundler",
        lib: ["dom", "esnext"],
        types: [],
      },
      files: ["embed.d.ts", "consumer.ts"],
    }),
  );

  const tsc = (source: string) => {
    return new Promise<{ code: number; out: string }>((resolve) => {
      writeFile(join(dir, "consumer.ts"), source).then(() => {
        const proc = spawn("pnpm", ["exec", "tsc", "-p", dir], { cwd: process.cwd() });
        let out = "";
        proc.stdout.on("data", (chunk) => (out += chunk));
        proc.stderr.on("data", (chunk) => (out += chunk));
        proc.on("close", (code) => resolve({ code: code ?? 1, out }));
      });
    });
  };

  const good = await tsc(`
    const summary = document.querySelector("acme-payments-summary")!;
    summary.balance = 1500;
    summary.currency = "GBP";
    summary.compact = true;
    summary.addEventListener("view-details", (event) => {
      const detail: unknown = event.detail;
      void detail;
    });
    summary.addEventListener("click", (event) => void event.offsetX);
    void summary.mount();
  `);
  expect(good.out).toBe("");
  expect(good.code).toBe(0);

  // The point of shipping types: the wrong primitive is a compile error.
  const bad = await tsc(`
    const summary = document.querySelector("acme-payments-summary")!;
    summary.currency = 1500;
  `);
  expect(bad.code).not.toBe(0);
  expect(bad.out).toContain("not assignable");

  await rm(dir, { recursive: true, force: true });
});
