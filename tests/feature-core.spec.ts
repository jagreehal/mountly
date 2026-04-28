import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("attach cleanup unmounts active instance and detaches listeners", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    const mount = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mount);

    let mountCalls = 0;
    let unmountCalls = 0;
    const feature = createOnDemandFeature({
      moduleId: "feature-cleanup",
      loadModule: async () => ({
        mount(container: HTMLElement, props: Record<string, unknown>) {
          mountCalls += 1;
          container.textContent = String(props.label ?? "mounted");
        },
        unmount(container: HTMLElement) {
          unmountCalls += 1;
          container.textContent = "";
        },
      }),
      render: ({ mod, container, props }) => mod.mount(container, props),
    });

    const detach = feature.attach({
      trigger,
      mount,
      preloadOn: false,
      activateOn: "click",
      props: { label: "first" },
    });

    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    detach();
    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      mountCalls,
      unmountCalls,
      mountText: mount.textContent,
      state: feature.getState(),
    };
  });

  expect(result.mountCalls).toBe(1);
  expect(result.unmountCalls).toBe(1);
  expect(result.mountText).toBe("");
  expect(result.state).toBe("activated");
});

test("attach with toggle=false keeps widget mounted on second activation click", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    const mount = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mount);

    let mountCalls = 0;
    let unmountCalls = 0;
    const feature = createOnDemandFeature({
      moduleId: "feature-toggle-false",
      loadModule: async () => ({
        mount(container: HTMLElement) {
          mountCalls += 1;
          container.textContent = "still-mounted";
        },
        unmount() {
          unmountCalls += 1;
        },
      }),
      render: ({ mod, container, props }) => mod.mount(container, props),
    });

    feature.attach({
      trigger,
      mount,
      preloadOn: false,
      activateOn: "click",
      toggle: false,
    });

    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      mountCalls,
      unmountCalls,
      state: feature.getState(),
      mountText: mount.textContent,
    };
  });

  expect(result.mountCalls).toBe(1);
  expect(result.unmountCalls).toBe(0);
  expect(result.state).toBe("mounted");
  expect(result.mountText).toBe("still-mounted");
});

test("update falls back to render remount when module has no update and getMounts stays accurate", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    document.body.appendChild(c1);
    document.body.appendChild(c2);

    let mountCalls = 0;
    let unmountCalls = 0;
    const feature = createOnDemandFeature({
      moduleId: "feature-update-fallback",
      loadModule: async () => ({
        mount(container: HTMLElement, props: Record<string, unknown>) {
          mountCalls += 1;
          container.textContent = String(props.label ?? "");
        },
        unmount() {
          unmountCalls += 1;
        },
      }),
      render: ({ mod, container, props }) => mod.mount(container, props),
    });

    const h1 = await feature.mount(c1, undefined, { label: "one" });
    const h2 = await feature.mount(c2, undefined, { label: "two" });
    const mountsAfterMount = feature.getMounts().length;

    await feature.update(c1, { label: "one-updated" });
    const mountsAfterUpdate = feature.getMounts().length;

    h1.unmount();
    const mountsAfterUnmount1 = feature.getMounts().length;
    h2.unmount();
    const mountsAfterUnmount2 = feature.getMounts().length;

    return {
      mountCalls,
      unmountCalls,
      mountsAfterMount,
      mountsAfterUpdate,
      mountsAfterUnmount1,
      mountsAfterUnmount2,
      c1Text: c1.textContent,
    };
  });

  expect(result.mountCalls).toBe(3);
  expect(result.unmountCalls).toBe(2);
  expect(result.mountsAfterMount).toBe(2);
  expect(result.mountsAfterUpdate).toBe(2);
  expect(result.mountsAfterUnmount1).toBe(1);
  expect(result.mountsAfterUnmount2).toBe(0);
  expect(result.c1Text).toBe("one-updated");
});

test("attach onError receives load failure without crashing", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    const mount = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mount);

    let onErrorMessage = "";
    const feature = createOnDemandFeature({
      moduleId: "feature-on-error",
      loadModule: async () => {
        throw new Error("load boom");
      },
      render: () => {},
    });

    feature.attach({
      trigger,
      mount,
      preloadOn: false,
      activateOn: "click",
      onError: (err) => {
        onErrorMessage =
          err instanceof Error ? err.message : String(err);
      },
    });

    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      onErrorMessage,
      state: feature.getState(),
      mountText: mount.textContent,
    };
  });

  expect(result.onErrorMessage).toContain("load boom");
  expect(result.state).toBe("idle");
  expect(result.mountText).toBe("");
});

test("attach throws an actionable error when trigger is null", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const feature = createOnDemandFeature({
      moduleId: "null-trigger-feature",
      loadModule: async () => ({ mount() {}, unmount() {} }),
      render: () => {},
    });
    try {
      // Simulate the very common mistake: getElementById missed the element.
      feature.attach({ trigger: null as unknown as HTMLElement });
      return { threw: false, message: "" };
    } catch (e) {
      return {
        threw: true,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  expect(result.threw).toBe(true);
  expect(result.message).toContain("null-trigger-feature");
  expect(result.message).toContain("instead of an Element");
  expect(result.message).toContain("getElementById");
});

test("attach throws an actionable error when mount is null", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const feature = createOnDemandFeature({
      moduleId: "null-mount-feature",
      loadModule: async () => ({ mount() {}, unmount() {} }),
      render: () => {},
    });
    try {
      feature.attach({ trigger, mount: null as unknown as HTMLElement });
      return { threw: false, message: "" };
    } catch (e) {
      return {
        threw: true,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  expect(result.threw).toBe(true);
  expect(result.message).toContain("null-mount-feature");
  expect(result.message).toContain("instead of an Element");
});

test("loadModule resolution failure is wrapped with import-map hint", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    const mount = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mount);

    let captured = "";
    const feature = createOnDemandFeature({
      moduleId: "missing-importmap-widget",
      loadModule: async () => {
        // Simulate the browser error a bare specifier import throws when the
        // import map is missing. Real-world: `import "missing-importmap-widget"`.
        throw new Error(
          "Failed to resolve module specifier 'missing-importmap-widget'",
        );
      },
      render: () => {},
    });

    feature.attach({
      trigger,
      mount,
      preloadOn: false,
      activateOn: "click",
      onError: (err) => {
        captured = err instanceof Error ? err.message : String(err);
      },
    });

    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { captured };
  });

  expect(result.captured).toContain("missing-importmap-widget");
  expect(result.captured).toContain("importmap");
  expect(result.captured).toContain("installRuntime");
  expect(result.captured).toContain("Original:");
});

test("attach with activateOn=url-change mounts on history updates and toggles on next update", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    const mountEl = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mountEl);

    let mounts = 0;
    let unmounts = 0;

    const feature = createOnDemandFeature({
      moduleId: "url-change-feature",
      loadModule: async () => ({
        mount: (container: HTMLElement) => {
          mounts++;
          container.textContent = `mounted-${mounts}`;
        },
        unmount: (container: HTMLElement) => {
          unmounts++;
          container.textContent = "";
        },
      }),
      render: ({ mod, container }) => mod.mount(container, {}),
    });

    const detach = feature.attach({
      trigger,
      mount: mountEl,
      activateOn: "url-change",
      activateOnUrlEvents: ["pushstate"],
    });

    history.pushState({ n: 1 }, "", "?n=1");
    await new Promise((r) => setTimeout(r, 0));
    const first = mountEl.textContent;

    history.pushState({ n: 2 }, "", "?n=2");
    await new Promise((r) => setTimeout(r, 0));
    const second = mountEl.textContent;

    detach();
    return { mounts, unmounts, first, second, state: feature.getState() };
  });

  expect(result.mounts).toBe(1);
  expect(result.unmounts).toBe(1);
  expect(result.first).toBe("mounted-1");
  expect(result.second).toBe("");
  expect(result.state).toBe("activated");
});

test("url-change attach cleanup detaches history listeners", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    const mountEl = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mountEl);

    let mounts = 0;
    const feature = createOnDemandFeature({
      moduleId: "url-change-cleanup",
      loadModule: async () => ({
        mount: (container: HTMLElement) => {
          mounts++;
          container.textContent = "mounted";
        },
        unmount: (container: HTMLElement) => {
          container.textContent = "";
        },
      }),
      render: ({ mod, container }) => mod.mount(container, {}),
    });

    const detach = feature.attach({
      trigger,
      mount: mountEl,
      activateOn: "url-change",
      activateOnUrlEvents: ["replacestate"],
      toggle: false,
    });

    history.replaceState({ n: 1 }, "", "?cleanup=1");
    await new Promise((r) => setTimeout(r, 0));
    detach();
    history.replaceState({ n: 2 }, "", "?cleanup=2");
    await new Promise((r) => setTimeout(r, 0));

    return {
      mounts,
      text: mountEl.textContent,
      state: feature.getState(),
    };
  });

  expect(result.mounts).toBe(1);
  expect(result.text).toBe("");
  expect(result.state).toBe("activated");
});

test("attach with activateOn=idle mounts without user interaction", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    const mountEl = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mountEl);

    let mounts = 0;
    const feature = createOnDemandFeature({
      moduleId: "idle-activate-feature",
      loadModule: async () => ({
        mount: (container: HTMLElement) => {
          mounts++;
          container.textContent = "idle-mounted";
        },
      }),
      render: ({ mod, container }) => mod.mount(container, {}),
    });

    feature.attach({
      trigger,
      mount: mountEl,
      preloadOn: false,
      activateOn: "idle",
      idleTimeout: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      mounts,
      text: mountEl.textContent,
      state: feature.getState(),
    };
  });

  expect(result.mounts).toBe(1);
  expect(result.text).toBe("idle-mounted");
  expect(result.state).toBe("mounted");
});

test("attach with activateOn=media mounts when media query matches", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    const mountEl = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mountEl);

    let mounts = 0;
    const feature = createOnDemandFeature({
      moduleId: "media-activate-feature",
      loadModule: async () => ({
        mount: (container: HTMLElement) => {
          mounts++;
          container.textContent = "media-mounted";
        },
      }),
      render: ({ mod, container }) => mod.mount(container, {}),
    });

    feature.attach({
      trigger,
      mount: mountEl,
      preloadOn: false,
      activateOn: "media",
      activateOnMediaQuery: "(min-width: 1px)",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      mounts,
      text: mountEl.textContent,
      state: feature.getState(),
    };
  });

  expect(result.mounts).toBe(1);
  expect(result.text).toBe("media-mounted");
  expect(result.state).toBe("mounted");
});

test("attach with preloadOn=media preloads module before click activation", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const trigger = document.createElement("button");
    const mountEl = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mountEl);

    let loadCalls = 0;
    const feature = createOnDemandFeature({
      moduleId: "media-preload-feature",
      loadModule: async () => {
        loadCalls++;
        return {
          mount: (container: HTMLElement) => {
            container.textContent = "mounted-after-click";
          },
        };
      },
      render: ({ mod, container }) => mod.mount(container, {}),
    });

    feature.attach({
      trigger,
      mount: mountEl,
      preloadOn: "media",
      preloadOnMediaQuery: "(min-width: 1px)",
      activateOn: "click",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const beforeClick = {
      loadCalls,
      state: feature.getState(),
      text: mountEl.textContent,
    };

    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    return {
      beforeClick,
      afterClick: {
        loadCalls,
        state: feature.getState(),
        text: mountEl.textContent,
      },
    };
  });

  expect(result.beforeClick.loadCalls).toBe(1);
  expect(result.beforeClick.state).toBe("preloaded");
  expect(result.beforeClick.text).toBe("");
  expect(result.afterClick.loadCalls).toBe(1);
  expect(result.afterClick.state).toBe("mounted");
  expect(result.afterClick.text).toBe("mounted-after-click");
});

test("viewportRootMargin is forwarded to IntersectionObserver for viewport triggers", async ({
  page,
}) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const OriginalIO = window.IntersectionObserver;
    const captured: Array<{ threshold?: number | number[]; rootMargin?: string }> = [];

    class FakeIO {
      constructor(
        private callback: IntersectionObserverCallback,
        private options?: IntersectionObserverInit,
      ) {
        captured.push({
          threshold: this.options?.threshold,
          rootMargin: this.options?.rootMargin,
        });
      }

      observe(target: Element) {
        this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }

    window.IntersectionObserver = FakeIO as unknown as typeof IntersectionObserver;
    try {
      const trigger = document.createElement("button");
      const mountEl = document.createElement("div");
      document.body.appendChild(trigger);
      document.body.appendChild(mountEl);

      const feature = createOnDemandFeature({
        moduleId: "viewport-root-margin-feature",
        loadModule: async () => ({
          mount: (container: HTMLElement) => {
            container.textContent = "mounted";
          },
        }),
        render: ({ mod, container }) => mod.mount(container, {}),
      });

      feature.attach({
        trigger,
        mount: mountEl,
        preloadOn: "viewport",
        activateOn: "viewport",
        viewportRootMargin: "220px",
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      return captured;
    } finally {
      window.IntersectionObserver = OriginalIO;
    }
  });

  expect(result.length).toBeGreaterThanOrEqual(2);
  for (const entry of result) {
    expect(entry.rootMargin).toBe("220px");
  }
});
