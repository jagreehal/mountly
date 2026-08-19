import { story } from "executable-stories-vitest";
import { describe, expect, it, vi } from "vite-plus/test";
import { DedupCache } from "../packages/mountly/src/cache";

describe("DedupCache.resolve abort listener cleanup", () => {
  it("removes the abort listener after the factory resolves", async ({ task }) => {
    story.init(task);
    story.given("an AbortController and a cache");

    const ac = new AbortController();
    const removeSpy = vi.spyOn(ac.signal, "removeEventListener");
    const cache = new DedupCache<string, number>();

    story.when("resolve succeeds with a signal");
    await cache.resolve("k", async () => 42, { signal: ac.signal });

    story.then("the abort listener is removed from the signal");
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));

    removeSpy.mockRestore();
  });

  it("removes the abort listener after the factory rejects", async ({ task }) => {
    story.init(task);
    story.given("an AbortController and a cache");

    const ac = new AbortController();
    const removeSpy = vi.spyOn(ac.signal, "removeEventListener");
    const cache = new DedupCache<string, number>();

    story.when("resolve fails with a signal");
    await cache.resolve("k", async () => { throw new Error("boom"); }, { signal: ac.signal }).catch(() => {});

    story.then("the abort listener is removed from the signal");
    expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));

    removeSpy.mockRestore();
  });
});
