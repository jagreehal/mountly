// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createFeatureRouter } from "../packages/mountly/src/router";
import type { OnDemandFeature } from "../packages/mountly/src/feature";

/** The slice of OnDemandFeature the router touches, with call records. */
function fakeFeature(id: string) {
  const unmount = vi.fn<() => void>();
  const mount = vi.fn<(...args: unknown[]) => Promise<{ unmount: () => void }>>(async () => ({
    unmount,
  }));
  const update = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
  return {
    id,
    unmount,
    mount,
    update,
    feature: { id, mount, update } as unknown as OnDemandFeature,
  };
}

function go(url: string): void {
  window.history.pushState({}, "", url);
}

describe("feature router", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    document.body.replaceChildren();
  });

  it("mounts the feature that owns the current URL segment", async ({ task }) => {
    story.init(task);
    story.given("a shell mapping two URL segments to independently owned features");
    const container = document.createElement("div");
    const products = fakeFeature("products");
    const settings = fakeFeature("settings");
    go("/products/42");

    const router = createFeatureRouter({
      container,
      routes: [
        { path: "/products/*", feature: products.feature },
        { path: "/settings/*", feature: settings.feature },
      ],
    });

    story.when("the router starts on /products/42");
    router.start();
    await vi.waitFor(() => expect(products.mount).toHaveBeenCalled());

    story.then("only the owning feature mounts, and it is told the rest of the path");
    expect(settings.mount).not.toHaveBeenCalled();
    expect(products.mount).toHaveBeenCalledWith(container, undefined, {
      route: { pathname: "/products/42", rest: "42", query: {} },
    });
    router.stop();
  });

  it("updates rather than remounts when navigation stays inside one feature", async ({ task }) => {
    story.init(task);
    story.given("a framed feature already mounted at /products/1");
    const container = document.createElement("div");
    const products = fakeFeature("products");
    go("/products/1");
    const router = createFeatureRouter({
      container,
      routes: [{ path: "/products/*", feature: products.feature }],
    });
    router.start();
    await vi.waitFor(() => expect(products.mount).toHaveBeenCalledTimes(1));

    story.when("the user navigates within that feature's own segment");
    go("/products/2");
    await vi.waitFor(() => expect(products.update).toHaveBeenCalled());

    story.then("no second mount happens — a remount would re-bootstrap the whole iframe");
    expect(products.mount).toHaveBeenCalledTimes(1);
    expect(products.unmount).not.toHaveBeenCalled();
    expect(products.update).toHaveBeenCalledWith(container, {
      route: { pathname: "/products/2", rest: "2", query: {} },
    });
    router.stop();
  });

  it("swaps features when the URL crosses an ownership boundary", async ({ task }) => {
    story.init(task);
    story.given("the products feature mounted");
    const container = document.createElement("div");
    const products = fakeFeature("products");
    const settings = fakeFeature("settings");
    go("/products/1");
    const router = createFeatureRouter({
      container,
      routes: [
        { path: "/products/*", feature: products.feature },
        { path: "/settings/*", feature: settings.feature },
      ],
    });
    router.start();
    await vi.waitFor(() => expect(products.mount).toHaveBeenCalled());

    story.when("navigation crosses into another team's segment");
    go("/settings/profile");
    await vi.waitFor(() => expect(settings.mount).toHaveBeenCalled());

    story.then("the previous feature is torn down before the next takes the outlet");
    expect(products.unmount).toHaveBeenCalledTimes(1);
    router.stop();
  });

  it("navigate() drives the same path as a back/forward button", async ({ task }) => {
    story.init(task);
    story.given("a router started on the fallback");
    const container = document.createElement("div");
    const products = fakeFeature("products");
    const home = fakeFeature("home");
    const router = createFeatureRouter({
      container,
      routes: [{ path: "/products/*", feature: products.feature }],
      fallback: home.feature,
    });
    router.start();
    await vi.waitFor(() => expect(home.mount).toHaveBeenCalled());

    story.when("a framed feature asks the host to navigate");
    router.navigate("/products/7");
    await vi.waitFor(() => expect(products.mount).toHaveBeenCalled());

    story.then("the host performs it — the frame never touched history itself");
    expect(window.location.pathname).toBe("/products/7");
    expect(home.unmount).toHaveBeenCalled();
    router.stop();
  });

  it("mounts the fallback when nothing owns the URL", async ({ task }) => {
    story.init(task);
    story.given("a router with a fallback and no matching route");
    const container = document.createElement("div");
    const home = fakeFeature("home");
    go("/nothing-here");
    const router = createFeatureRouter({
      container,
      routes: [],
      fallback: home.feature,
    });

    story.when("it starts");
    router.start();
    await vi.waitFor(() => expect(home.mount).toHaveBeenCalled());

    story.then("the fallback owns the outlet");
    expect(home.mount).toHaveBeenCalledTimes(1);
    router.stop();
  });

  it("passes the query string through to the feature", async ({ task }) => {
    story.init(task);
    story.given("a URL carrying query state");
    const container = document.createElement("div");
    const products = fakeFeature("products");
    go("/products?tab=reviews");
    const router = createFeatureRouter({
      container,
      routes: [{ path: "/products/*", feature: products.feature }],
    });

    story.when("the router matches it");
    router.start();
    await vi.waitFor(() => expect(products.mount).toHaveBeenCalled());

    story.then("the feature receives the parsed query alongside the path");
    expect(products.mount).toHaveBeenCalledWith(container, undefined, {
      route: { pathname: "/products", rest: "", query: { tab: "reviews" } },
    });
    router.stop();
  });

  it("stop() unmounts and stops reacting to further navigation", async ({ task }) => {
    story.init(task);
    story.given("a started router");
    const container = document.createElement("div");
    const products = fakeFeature("products");
    go("/products/1");
    const router = createFeatureRouter({
      container,
      routes: [{ path: "/products/*", feature: products.feature }],
    });
    router.start();
    await vi.waitFor(() => expect(products.mount).toHaveBeenCalled());

    story.when("the shell tears the router down and the URL changes again");
    router.stop();
    go("/products/2");

    story.then("nothing is mounted and no listener remains");
    expect(products.unmount).toHaveBeenCalledTimes(1);
    expect(products.update).not.toHaveBeenCalled();
  });

  it("discards a mount that resolves after stop", async ({ task }) => {
    story.init(task);
    story.given("a route whose feature is still loading when the router stops");
    const container = document.createElement("div");
    let finishMount!: (handle: { unmount: () => void }) => void;
    const unmount = vi.fn<() => void>();
    const mount = vi.fn<() => Promise<{ unmount: () => void }>>(
      () =>
        new Promise<{ unmount: () => void }>((resolve) => {
          finishMount = resolve;
        }),
    );
    const feature = {
      id: "products",
      mount,
      update: vi.fn<() => Promise<void>>(async () => {}),
    } as unknown as OnDemandFeature;
    go("/products/1");
    const router = createFeatureRouter({
      container,
      routes: [{ path: "/products/*", feature }],
    });
    router.start();
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1));

    story.when("the shell tears down before loading finishes");
    router.stop();
    finishMount({ unmount });

    story.then("the late feature is immediately discarded instead of remounting after teardown");
    await vi.waitFor(() => expect(unmount).toHaveBeenCalledTimes(1));
  });
});
