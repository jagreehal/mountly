import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vitest";
import { DedupCache } from "../packages/mountly/src/cache";

describe("DedupCache", () => {
  it("deduplicates concurrent resolve calls for the same key", async ({ task }) => {
    story.init(task);
    story.given("an empty cache and a resolve factory for key 'k'");

    const cache = new DedupCache<string, number>();
    let calls = 0;
    const factory = async () => {
      calls += 1;
      await Promise.resolve();
      return 42;
    };

    story.when("resolve is called twice concurrently for the same key");
    const [first, second] = await Promise.all([cache.resolve("k", factory), cache.resolve("k", factory)]);

    story.then("both callers get the same value and the factory runs once");
    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(calls).toBe(1);
  });

  it("evicts oldest entries when maxEntries is exceeded", ({ task }) => {
    story.init(task);
    story.given("a cache configured with maxEntries=2");

    const cache = new DedupCache<string, number>({ maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);

    story.when("a third entry is inserted");
    cache.set("c", 3);

    story.then("the oldest entry is evicted");
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });
});
