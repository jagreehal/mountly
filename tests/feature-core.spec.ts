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
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
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

    const detach = attach(feature, {
      trigger,
      mount,
      activateOn: onTrigger.click(trigger),
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
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
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

    attach(feature, {
      trigger,
      mount,
      activateOn: onTrigger.click(trigger),
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

    let renderCount = 0;
    let mountCount = 0;
    const feature = createOnDemandFeature({
      moduleId: "feature-update-remount",
      loadModule: async () => ({
        mount(container: HTMLElement, props: Record<string, unknown>) {
          mountCount += 1;
          container.textContent = `mount ${String(props.value ?? "")}`;
        },
        unmount(container: HTMLElement) {
          container.textContent = "";
        },
      }),
      render: ({ mod, container, props }) => {
        renderCount += 1;
        mod.mount(container, props);
      },
    });

    await feature.mount(c1, undefined, { value: 1 });
    await feature.mount(c2, undefined, { value: 2 });

    const mountsBefore = feature.getMounts().length;

    await feature.update(c1, { value: 99 });

    const mountsAfter = feature.getMounts().length;

    return {
      mountsBefore,
      mountsAfter,
      mountCount,
      renderCount,
      c1Text: c1.textContent,
      c2Text: c2.textContent,
    };
  });

  expect(result.mountsBefore).toBe(2);
  expect(result.mountsAfter).toBe(2);
  expect(result.mountCount).toBe(3);
  expect(result.renderCount).toBe(3);
  expect(result.c1Text).toBe("mount 99");
  expect(result.c2Text).toBe("mount 2");
});

test("attach onError reports loadModule failures from activation", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
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

    attach(feature, {
      trigger,
      mount,
      activateOn: onTrigger.click(trigger),
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
    const { attach } = await import("/packages/mountly/dist/attach.js");
    const feature = createOnDemandFeature({
      moduleId: "null-trigger-feature",
      loadModule: async () => ({ mount() {}, unmount() {} }),
      render: () => {},
    });
    try {
      attach(feature, { trigger: null as unknown as HTMLElement });
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
    const { attach } = await import("/packages/mountly/dist/attach.js");
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const feature = createOnDemandFeature({
      moduleId: "null-mount-feature",
      loadModule: async () => ({ mount() {}, unmount() {} }),
      render: () => {},
    });
    try {
      attach(feature, { trigger, mount: null as unknown as HTMLElement });
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
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
    const trigger = document.createElement("button");
    const mount = document.createElement("div");
    document.body.appendChild(trigger);
    document.body.appendChild(mount);

    let captured = "";
    const feature = createOnDemandFeature({
      moduleId: "missing-importmap-widget",
      loadModule: async () => {
        throw new Error(
          "Failed to resolve module specifier 'missing-importmap-widget'",
        );
      },
      render: () => {},
    });

    attach(feature, {
      trigger,
      mount,
      activateOn: onTrigger.click(trigger),
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

test("attach with activateOn=urlChange mounts on history updates and toggles on next update", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
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

    const detach = attach(feature, {
      trigger,
      mount: mountEl,
      activateOn: onTrigger.urlChange({ events: ["pushstate"] }),
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

test("urlChange attach cleanup detaches history listeners", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { createOnDemandFeature } = await import("/packages/mountly/dist/index.js");
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
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

    const detach = attach(feature, {
      trigger,
      mount: mountEl,
      activateOn: onTrigger.urlChange({ events: ["replacestate"] }),
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
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
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

    attach(feature, {
      trigger,
      mount: mountEl,
      activateOn: onTrigger.idle({ timeout: 1 }),
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
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
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

    attach(feature, {
      trigger,
      mount: mountEl,
      activateOn: onTrigger.media("(min-width: 1px)"),
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
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
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

    attach(feature, {
      trigger,
      mount: mountEl,
      preloadOn: onTrigger.media("(min-width: 1px)"),
      activateOn: onTrigger.click(trigger),
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
    const { attach, onTrigger } = await import("/packages/mountly/dist/attach.js");
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

      attach(feature, {
        trigger,
        mount: mountEl,
        preloadOn: onTrigger.viewport(trigger, { rootMargin: "220px" }),
        activateOn: onTrigger.viewport(trigger, { rootMargin: "220px" }),
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
