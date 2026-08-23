// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mount,
  mountly,
  reset,
  triggers,
  unmount,
  update,
  wire,
} from "../packages/mountly/src/core.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

function widget() {
  const seen: Array<Record<string, unknown>> = [];
  return {
    seen,
    module: {
      mount(el: HTMLElement, props: Record<string, unknown>) {
        seen.push(props);
        el.textContent = String(props.msg ?? "mounted");
      },
      unmount(el: HTMLElement) {
        el.textContent = "";
      },
    },
  };
}

let stop: (() => void) | undefined;
const start = (load: (url: string) => Promise<unknown>, urls?: Record<string, string>) => {
  stop = mountly({ load, urls });
};

afterEach(() => {
  stop?.();
  stop = undefined;
  reset();
  document.body.innerHTML = "";
});

describe("core islands", () => {
  it("mounts on click with data-props", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-props='{"msg":"hi"}'></div>`;
    start(async () => w.module);
    const el = document.getElementById("i")!;
    expect(el.dataset.mountlyState).toBe("idle");

    el.click();
    await flush();
    expect(el.textContent).toBe("hi");
    expect(el.dataset.mountlyState).toBe("mounted");
    // adapters need these to adopt shadow-DOM stylesheets
    expect(w.seen[0]).toMatchObject({ moduleUrl: "/w.js", cssUrl: "/w.css" });
  });

  it("reads props from a JSON script child so quotes need no escaping", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js">
      <script type="application/json">{"msg":"He said \\"hi\\""}</script>
    </div>`;
    start(async () => w.module);
    document.getElementById("i")!.click();
    await flush();
    expect(document.getElementById("i")!.textContent).toBe('He said "hi"');
  });

  it("mounts into data-target, falling back to a document-wide selector", async () => {
    const w = widget();
    document.body.innerHTML = `<button id="t" data-mountly="/w.js" data-target="#panel"></button><div id="panel"></div>`;
    start(async () => w.module);
    document.getElementById("t")!.click();
    await flush();
    expect(document.getElementById("panel")!.textContent).toBe("mounted");
    expect(document.getElementById("t")!.textContent).toBe("");
  });

  it("only toggles when asked", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="a" data-mountly="/w.js"></div><div id="b" data-mountly="/w.js" data-toggle></div>`;
    start(async () => w.module);
    const [a, b] = [document.getElementById("a")!, document.getElementById("b")!];

    a.click();
    b.click();
    await flush();
    a.click();
    b.click();
    await flush();
    expect(a.textContent).toBe("mounted");
    expect(b.textContent).toBe("");
    expect(b.dataset.mountlyState).toBe("idle");
  });

  it("resolves an alias through the url map", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="cart"></div>`;
    const load = vi.fn(async () => w.module);
    start(load, { cart: "/widgets/cart.js" });
    document.getElementById("i")!.click();
    await flush();
    expect(load).toHaveBeenCalledWith("/widgets/cart.js");
  });

  it("dedupes a double click into one mount", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js"></div>`;
    start(async () => w.module);
    const el = document.getElementById("i")!;
    el.click();
    el.click();
    await flush();
    expect(w.seen).toHaveLength(1);
  });

  it("surfaces a failed load as state + event, and retries on the next intent", async () => {
    const w = widget();
    let calls = 0;
    document.body.innerHTML = `<div id="i" data-mountly="/w.js"></div>`;
    const errors: Event[] = [];
    document.body.addEventListener("mountly:error", (e) => errors.push(e));
    vi.spyOn(console, "error").mockImplementation(() => {});
    start(async () => {
      if (calls++ === 0) throw new Error("boom");
      return w.module;
    });

    const el = document.getElementById("i")!;
    el.click();
    await flush();
    expect(el.dataset.mountlyState).toBe("error");
    expect(errors).toHaveLength(1);

    el.click();
    await flush();
    expect(el.dataset.mountlyState).toBe("mounted");
  });

  it("picks up islands added to the DOM after bootstrap", async () => {
    const w = widget();
    start(async () => w.module);
    document.body.innerHTML = `<section><div id="late" data-mountly="/w.js"></div></section>`;
    await flush();
    document.getElementById("late")!.click();
    await flush();
    expect(document.getElementById("late")!.textContent).toBe("mounted");
  });

  it("leaves a server-rendered island alone", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-mountly-state="mounted">from the server</div>`;
    start(async () => w.module);
    document.getElementById("i")!.click();
    await flush();
    expect(document.getElementById("i")!.textContent).toBe("from the server");
    expect(w.seen).toHaveLength(0);
  });

  it("preloads without mounting, then mounts from cache", async () => {
    const w = widget();
    const load = vi.fn(async () => w.module);
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-preload="viewport"></div>`;
    const observed: Array<(entries: unknown[]) => void> = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: unknown[]) => void) {
          observed.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    start(load);
    observed[0]!([{ isIntersecting: true }]);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(w.seen).toHaveLength(0);

    document.getElementById("i")!.click();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(w.seen).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("keeps a media query's spaces intact when several triggers share one attribute", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="media:(min-width: 1px) click"></div>`;
    const matches: string[] = [];
    vi.stubGlobal("matchMedia", (q: string) => {
      matches.push(q);
      return { matches: false, addEventListener() {}, removeEventListener() {} };
    });
    start(async () => w.module);
    expect(matches).toEqual(["(min-width: 1px)"]);
    expect(document.getElementById("i")!.dataset.mountlyState).toBe("idle");

    document.getElementById("i")!.click();
    await flush();
    expect(document.getElementById("i")!.textContent).toBe("mounted");
    vi.unstubAllGlobals();
  });

  it("rejects an unknown trigger loudly instead of silently doing nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="telepathy"></div>`;
    start(async () => widget().module);
    expect(document.getElementById("i")!.dataset.mountlyState).toBe("error");
  });

  it("takes a custom trigger by assignment — the table is the registry", async () => {
    const w = widget();
    let fire = () => {};
    triggers.swipe = (el, direction, run) => {
      fire = () => direction === "left" && run();
      return () => {};
    };
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="swipe:left"></div>`;
    start(async () => w.module);

    fire();
    await flush();
    expect(document.getElementById("i")!.textContent).toBe("mounted");
    delete triggers.swipe;
  });

  it("fires the url trigger on pushState, not just popstate", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="url"></div>`;
    start(async () => w.module);

    history.pushState({}, "", "/next");
    await flush();
    expect(document.getElementById("i")!.textContent).toBe("mounted");
  });

  it("reports a widget whose mount() rejects, instead of stranding it in loading", async () => {
    const errors: unknown[] = [];
    const rejections: unknown[] = [];
    document.body.addEventListener("mountly:error", (e) => errors.push(e));
    const onRejection = (e: PromiseRejectionEvent) => rejections.push(e.reason);
    window.addEventListener("unhandledrejection", onRejection);
    vi.spyOn(console, "error").mockImplementation(() => {});

    document.body.innerHTML = `<div id="i" data-mountly="/w.js"></div>`;
    let attempt = 0;
    const w = widget();
    start(async () => ({
      mount: async (el: HTMLElement, props: Record<string, unknown>) => {
        if (attempt++ === 0) throw new Error("widget blew up");
        w.module.mount(el, props);
      },
    }));

    const el = document.getElementById("i")!;
    el.click();
    await flush();
    expect(el.dataset.mountlyState).toBe("error");
    expect(errors).toHaveLength(1);
    expect(rejections).toHaveLength(0);

    // and it is genuinely unmounted, so the next intent tries again
    el.click();
    await flush();
    expect(el.dataset.mountlyState).toBe("mounted");
    window.removeEventListener("unhandledrejection", onRejection);
  });

  it("mounts a preload trigger that already matches without exploding", async () => {
    const w = widget();
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
    const load = vi.fn(async () => w.module);
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-preload="media:(min-width: 1px)"></div>`;
    start(load);

    const el = document.getElementById("i")!;
    // a synchronous preload must not leave the island in the error state
    expect(el.dataset.mountlyState).toBe("idle");
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(w.seen).toHaveLength(0);

    el.click();
    await flush();
    expect(el.textContent).toBe("mounted");
    vi.unstubAllGlobals();
  });

  it("honours an unmount that lands while the module is still loading", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js"></div>`;
    let release: (m: unknown) => void = () => {};
    start(() => new Promise((resolve) => (release = resolve)));

    const el = document.getElementById("i")!;
    el.click();
    expect(el.dataset.mountlyState).toBe("loading");

    unmount(el);
    expect(el.dataset.mountlyState).toBe("idle");
    release(w.module);
    await flush();

    // the late-arriving module must not mount over the user's decision
    expect(w.seen).toHaveLength(0);
    expect(el.dataset.mountlyState).toBe("idle");

    // and the island still works afterwards
    el.click();
    await flush();
    expect(el.textContent).toBe("mounted");
  });

  it("tears down a widget that finishes mounting after an unmount", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js"></div>`;
    let finish: () => void = () => {};
    const unmounted: HTMLElement[] = [];
    start(async () => ({
      mount: (el: HTMLElement, props: Record<string, unknown>) =>
        new Promise<void>((resolve) => {
          w.module.mount(el, props);
          finish = resolve;
        }),
      unmount: (el: HTMLElement) => unmounted.push(el),
    }));

    const el = document.getElementById("i")!;
    el.click();
    await flush();
    unmount(el);
    finish();
    await flush();

    expect(unmounted).toHaveLength(1);
    expect(el.textContent).toBe("");
    expect(el.dataset.mountlyState).toBe("idle");
  });

  it("does not let a superseded mount erase the remount that replaced it", async () => {
    document.body.innerHTML = `<div id="i" data-mountly="/w.js"></div>`;
    let finishFirst: () => void = () => {};
    let first = true;
    start(async () => ({
      mount(el: HTMLElement) {
        el.textContent = first ? "old" : "new";
        if (!first) return;
        first = false;
        return new Promise<void>((resolve) => (finishFirst = resolve));
      },
      unmount: (el: HTMLElement) => el.replaceChildren(),
    }));

    const el = document.getElementById("i")!;
    el.click();
    await flush();

    // unmount + remount while the first mount() is still in flight
    unmount(el);
    el.click();
    finishFirst();
    await flush();

    expect(el.dataset.mountlyState).toBe("mounted");
    expect(el.textContent).toBe("new");
  });

  // A widget whose unmount() keeps working after it returns — an exit
  // animation, a flush — clears the container on a later task.
  const slowUnmount = () => ({
    mount: (el: HTMLElement) => void (el.textContent = "mounted"),
    async unmount(el: HTMLElement) {
      await new Promise((r) => setTimeout(r, 0));
      el.replaceChildren();
    },
  });

  it("does not let a slow unmount erase the remount that followed it", async () => {
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="never"></div>`;
    const load = async () => slowUnmount();
    const el = document.getElementById("i")!;

    await mount(el, { load });
    unmount(el);
    await mount(el, { load });
    await flush();

    expect(el.dataset.mountlyState).toBe("mounted");
    expect(el.textContent).toBe("mounted");
  });

  it("does not let an async update overwrite a later remount", async () => {
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="never"></div>`;
    let mounts = 0;
    const mod = {
      mount(el: HTMLElement) {
        el.textContent = `mount-${++mounts}`;
      },
      async update(el: HTMLElement) {
        await new Promise((r) => setTimeout(r, 0));
        el.textContent = "late-update";
      },
      unmount(el: HTMLElement) {
        el.replaceChildren();
      },
    };
    const load = async () => mod;
    const el = document.getElementById("i")!;

    await mount(el, { load });
    update(el, { version: 2 });
    unmount(el);
    await mount(el, { load });
    await flush();

    expect(el.dataset.mountlyState).toBe("mounted");
    expect(el.textContent).toBe("mount-2");
  });

  it("reports a rejected async update instead of leaking an unhandled rejection", async () => {
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="never"></div>`;
    const errors: Event[] = [];
    document.body.addEventListener("mountly:error", (event) => errors.push(event));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = {
      mount: (el: HTMLElement) => void (el.textContent = "mounted"),
      update: async () => {
        throw new Error("update failed");
      },
      unmount: (el: HTMLElement) => el.replaceChildren(),
    };
    const el = document.getElementById("i")!;

    await mount(el, { load: async () => mod });
    update(el, { version: 2 });
    await flush();

    expect(el.dataset.mountlyState).toBe("error");
    expect(errors).toHaveLength(1);
  });

  it("serializes islands that share one data-target", async () => {
    document.body.innerHTML = `
      <button id="a" data-mountly="/a.js" data-on="never" data-target="#panel"></button>
      <button id="b" data-mountly="/b.js" data-on="never" data-target="#panel"></button>
      <div id="panel"></div>`;
    const modules = {
      "/a.js": {
        mount: (el: HTMLElement) => void (el.textContent = "a"),
        async unmount(el: HTMLElement) {
          await new Promise((r) => setTimeout(r, 0));
          el.replaceChildren();
        },
      },
      "/b.js": {
        mount: (el: HTMLElement) => void (el.textContent = "b"),
        unmount: () => {},
      },
    };
    const load = async (url: string) => modules[url as keyof typeof modules];
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    const panel = document.getElementById("panel")!;

    await mount(a, { load });
    unmount(a);
    await mount(b, { load });
    await flush();

    expect(b.dataset.mountlyState).toBe("mounted");
    expect(panel.textContent).toBe("b");
  });

  it("carries an unfinished teardown across a stop() and re-wire", async () => {
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="never"></div>`;
    const load = async () => slowUnmount();
    const el = document.getElementById("i")!;

    await mount(el, { load });
    // stop() unmounts and drops the state; the widget is still tearing down
    wire(el, { load })();
    await mount(el, { load });
    await flush();

    expect(el.dataset.mountlyState).toBe("mounted");
    expect(el.textContent).toBe("mounted");
  });

  it("makes a wire teardown idempotent across a later re-wire", async () => {
    document.body.innerHTML = `<div id="i" data-mountly="/w.js"></div>`;
    const w = widget();
    const load = async () => w.module;
    const el = document.getElementById("i")!;

    const oldStop = wire(el, { load });
    oldStop();
    wire(el, { load });
    oldStop();
    el.click();
    await flush();

    expect(el.dataset.mountlyState).toBe("mounted");
    expect(el.textContent).toBe("mounted");
  });

  it("wires no trigger at all when one name in the list is unknown", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="click telepathy"></div>`;
    start(async () => w.module);

    const el = document.getElementById("i")!;
    expect(el.dataset.mountlyState).toBe("error");
    el.click();
    await flush();
    expect(w.seen).toHaveLength(0);
    expect(el.dataset.mountlyState).toBe("error");
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("teardown boom");
      },
    ],
    ["rejects", () => Promise.reject(new Error("teardown boom"))],
  ])("clears the target when a widget's unmount() %s", async (_label, unmount_) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="never"></div>`;
    const load = async () => ({
      mount: (el: HTMLElement) => void (el.textContent = "mounted"),
      unmount: unmount_,
    });
    const el = document.getElementById("i")!;

    await mount(el, { load });
    unmount(el);
    await flush();

    // A widget that fails to clean up must not strand the island: the target is
    // emptied anyway and the next intent gets a working mount.
    expect(el.textContent).toBe("");
    expect(el.dataset.mountlyState).toBe("idle");
    await mount(el, { load });
    expect(el.textContent).toBe("mounted");
    vi.restoreAllMocks();
  });

  it("reports data-module-url as moduleUrl when the island loads by key", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="cart" data-module-url="/w/cart.js" data-on="never"></div>`;
    const el = document.getElementById("i")!;

    await mount(el, { load: async () => w.module });

    // The load key stays the island's own, so two keys sharing a bundle keep
    // separate cache entries — but the widget is told where its bundle lives.
    expect(w.seen[0]).toMatchObject({ moduleUrl: "/w/cart.js" });
  });

  it("exposes imperative mount/update/unmount", async () => {
    const w = widget();
    document.body.innerHTML = `<div id="i" data-mountly="/w.js" data-on="never"></div>`;
    start(async () => w.module);
    const el = document.getElementById("i")!;

    await mount(el, { load: async () => w.module });
    expect(el.textContent).toBe("mounted");
    update(el, { msg: "updated" });
    expect(el.textContent).toBe("updated");
    unmount(el);
    expect(el.textContent).toBe("");
    expect(el.dataset.mountlyState).toBe("idle");
  });
});
