import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("custom element warns on invalid props JSON and falls back to empty props", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning") warnings.push(msg.text());
  });

  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import("/packages/mountly/dist/index.js");

    defineMountlyFeature();
    const moduleId = "ce-invalid-props";
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement, props: Record<string, unknown>) {
            container.textContent = JSON.stringify(props);
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement("mountly-feature");
    root.setAttribute("module-id", moduleId);
    root.setAttribute("props", "{bad json");
    root.innerHTML = `<button id="trigger">Open</button><div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector("#trigger") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      slotText: root.querySelector("#slot")?.textContent ?? "",
    };
  });

  expect(result.slotText).toBe("{}");
  expect(warnings.some((w) => w.includes("invalid JSON in props attribute"))).toBe(true);
});

test("changing module-id tears down previous feature and mounts the new feature", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import("/packages/mountly/dist/index.js");

    defineMountlyFeature();
    const oldId = "ce-module-a";
    const nextId = "ce-module-b";
    unregisterCustomElement(oldId);
    unregisterCustomElement(nextId);

    let oldUnmounts = 0;
    registerCustomElement(oldId, () =>
      createOnDemandFeature({
        moduleId: oldId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = "A";
          },
          unmount() {
            oldUnmounts += 1;
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    registerCustomElement(nextId, () =>
      createOnDemandFeature({
        moduleId: nextId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = "B";
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement("mountly-feature");
    root.setAttribute("module-id", oldId);
    root.innerHTML = `<button id="trigger">Open</button><div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector("#trigger") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    root.setAttribute("module-id", nextId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector("#trigger") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      oldUnmounts,
      slotText: root.querySelector("#slot")?.textContent ?? "",
    };
  });

  expect(result.oldUnmounts).toBeGreaterThanOrEqual(1);
  expect(result.slotText).toBe("B");
});

test("disconnectedCallback detaches and unmounts active custom-element feature", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import("/packages/mountly/dist/index.js");

    defineMountlyFeature();
    const moduleId = "ce-disconnect";
    unregisterCustomElement(moduleId);

    let unmounts = 0;
    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = "mounted";
          },
          unmount(container: HTMLElement) {
            unmounts += 1;
            container.textContent = "";
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      })
    );

    const root = document.createElement("mountly-feature");
    root.setAttribute("module-id", moduleId);
    root.innerHTML = `<button id="trigger">Open</button><div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    (root.querySelector("#trigger") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    root.remove();

    return { unmounts };
  });

  expect(result.unmounts).toBe(1);
});

test("custom element warns with actionable hint when module-id is unregistered", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning") warnings.push(msg.text());
  });

  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import("/packages/mountly/dist/index.js");

    defineMountlyFeature();
    // Register one feature so the warning can list at least one known id.
    unregisterCustomElement("known-feature");
    registerCustomElement("known-feature", () =>
      createOnDemandFeature({
        moduleId: "known-feature",
        loadModule: async () => ({ mount() {}, unmount() {} }),
        render: () => {},
      }),
    );

    const root = document.createElement("mountly-feature");
    root.setAttribute("module-id", "typo-feature");
    document.body.appendChild(root);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const hint = warnings.find((w) => w.includes("typo-feature"));
  expect(hint, "must warn for the unregistered module-id").toBeTruthy();
  expect(hint).toContain("registerCustomElement");
  expect(hint).toContain("known-feature");
});

test("custom element with trigger=viewport mounts automatically on visibility", async ({
  page,
}) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import("/packages/mountly/dist/index.js");

    defineMountlyFeature();
    const moduleId = "ce-viewport";
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = "viewport mounted";
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      }),
    );

    const root = document.createElement("mountly-feature");
    root.setAttribute("module-id", moduleId);
    root.setAttribute("trigger", "viewport");
    root.innerHTML = `<div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    // IntersectionObserver + mount pipeline is async.
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      slotText: root.querySelector("#slot")?.textContent ?? "",
    };
  });

  expect(result.slotText).toBe("viewport mounted");
});

test("custom element with trigger=url-change mounts on history updates", async ({
  page,
}) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import("/packages/mountly/dist/index.js");

    defineMountlyFeature();
    const moduleId = "ce-url-change";
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = "url-change mounted";
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      }),
    );

    const root = document.createElement("mountly-feature");
    root.setAttribute("module-id", moduleId);
    root.setAttribute("trigger", "url-change");
    root.setAttribute("url-events", "pushstate");
    root.innerHTML = `<div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    history.pushState({ n: 1 }, "", "?ce=1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      slotText: root.querySelector("#slot")?.textContent ?? "",
    };
  });

  expect(result.slotText).toBe("url-change mounted");
});

test("custom element with trigger=idle mounts without interaction", async ({
  page,
}) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import("/packages/mountly/dist/index.js");

    defineMountlyFeature();
    const moduleId = "ce-idle";
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = "idle mounted";
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      }),
    );

    const root = document.createElement("mountly-feature");
    root.setAttribute("module-id", moduleId);
    root.setAttribute("trigger", "idle");
    root.setAttribute("idle-timeout", "1");
    root.innerHTML = `<div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 20));

    return {
      slotText: root.querySelector("#slot")?.textContent ?? "",
    };
  });

  expect(result.slotText).toBe("idle mounted");
});

test("custom element with trigger=media mounts when media query matches", async ({
  page,
}) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const {
      createOnDemandFeature,
      defineMountlyFeature,
      registerCustomElement,
      unregisterCustomElement,
    } = await import("/packages/mountly/dist/index.js");

    defineMountlyFeature();
    const moduleId = "ce-media";
    unregisterCustomElement(moduleId);

    registerCustomElement(moduleId, () =>
      createOnDemandFeature({
        moduleId,
        loadModule: async () => ({
          mount(container: HTMLElement) {
            container.textContent = "media mounted";
          },
        }),
        render: ({ mod, container, props }) => mod.mount(container, props),
      }),
    );

    const root = document.createElement("mountly-feature");
    root.setAttribute("module-id", moduleId);
    root.setAttribute("trigger", "media");
    root.setAttribute("activate-media-query", "(min-width: 1px)");
    root.innerHTML = `<div data-mountly-mount id="slot"></div>`;
    document.body.appendChild(root);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 20));

    return {
      slotText: root.querySelector("#slot")?.textContent ?? "",
    };
  });

  expect(result.slotText).toBe("media mounted");
});
