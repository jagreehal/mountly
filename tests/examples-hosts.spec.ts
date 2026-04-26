import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("quickstart host mounts the widget on click", async ({ page }) => {
  await page.goto("http://localhost:5175/examples/quickstart/host.html");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "View payment" }).click();
  await page.waitForFunction(() => {
    const mount = document.getElementById("mount");
    const dialog = mount?.shadowRoot?.querySelector("[role='dialog']");
    return !!dialog && dialog.textContent?.includes("Total due");
  });
});

test("plain-html self-contained host copy-paste flow works", async ({ page }) => {
  await page.goto("http://localhost:5175/examples/plain-html/");
  await page.waitForLoadState("networkidle");
  await page.locator("#trigger-1").click();
  await page.waitForFunction(() => {
    const mount = document.getElementById("slot-1");
    const dialog = mount?.shadowRoot?.querySelector("[role='dialog']");
    return !!dialog && dialog.textContent?.includes("Total due");
  });
});

test("shared-react host import map includes jsx runtime mapping", async ({ page }) => {
  await page.goto("http://localhost:5175/examples/plain-html/shared-react.html");
  await page.waitForLoadState("networkidle");
  const imports = await page.evaluate(() => {
    const el = document.querySelector("script[type=importmap]");
    return el ? JSON.parse(el.textContent ?? "{}").imports : {};
  });
  expect(imports["react"]).toContain("react@18");
  expect(imports["react/jsx-runtime"]).toContain("jsx-runtime");
  expect(imports["react-dom/client"]).toContain("react-dom@18");
});

test("marketing-site production example ships correct import map and host-token overrides", async ({ page }) => {
  await page.goto("http://localhost:5175/examples/marketing-site/");
  await page.waitForLoadState("networkidle");
  const result = await page.evaluate(() => {
    const mapEl = document.querySelector("script[type=importmap]");
    const imports = mapEl ? JSON.parse(mapEl.textContent ?? "{}").imports : {};
    const inlineMount = document.querySelector("mountly-feature [data-mountly-mount]");
    return {
      imports,
      inlineStyle: inlineMount?.getAttribute("style") ?? "",
    };
  });
  expect(result.imports["react"]).toContain("react@18");
  expect(result.imports["react/jsx-runtime"]).toContain("jsx-runtime");
  expect(result.imports["react-dom/client"]).toContain("react-dom@18");
  expect(result.imports["mountly"]).toContain("/packages/mountly/dist/index.js");
  expect(result.imports["mountly-react"]).toContain(
    "/packages/adapters/mountly-react/dist/index.js",
  );
  expect(result.imports["signup-card"]).toContain("/examples/signup-card/dist/peer.js");
  expect(result.inlineStyle).toContain("--primary");
  expect(result.inlineStyle).toContain("--ring");

  // Viewport-triggered declarative embed should auto-mount when scrolled into view.
  await page.locator("mountly-feature[module-id='signup-card']").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const mount = document.querySelector("mountly-feature [data-mountly-mount]");
    const text = mount?.shadowRoot?.textContent ?? "";
    return text.includes("SignupCard");
  });
});
