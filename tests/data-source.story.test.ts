import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vitest";
import { createDataSource } from "../packages/mountly/src/data-source";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createDataSource", () => {
  it("dedupes concurrent reads and exposes loading/success snapshots", async ({ task }) => {
    story.init(task);
    story.given("a data source with one async loader");

    let calls = 0;
    const source = createDataSource<string, number>({
      load: async () => {
        calls += 1;
        await tick();
        return 42;
      },
    });

    const snapshots: string[] = [];
    source.subscribe("answer", (snapshot) => snapshots.push(snapshot.status));

    story.when("two callers read the same key concurrently");
    const [a, b] = await Promise.all([source.read("answer"), source.read("answer")]);

    story.then("both get one loaded value and the loader runs once");
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(calls).toBe(1);
    expect(snapshots).toContain("loading");
    expect(source.getSnapshot("answer")).toMatchObject({
      status: "success",
      data: 42,
      loading: false,
    });
  });

  it("returns stale cached data while revalidating in the background", async ({ task }) => {
    story.init(task);
    story.given("a data source with staleTime=0 and stale-while-revalidate enabled");

    let value = 1;
    const source = createDataSource<string, number>({
      staleTime: 0,
      load: async () => value,
    });

    await source.read("k");
    value = 2;

    story.when("the stale key is read again");
    const stale = await source.read("k");
    await tick();

    story.then("the caller gets cached data first, then the snapshot refreshes");
    expect(stale).toBe(1);
    expect(source.getSnapshot("k").data).toBe(2);
  });

  it("retries failed loads before surfacing an error", async ({ task }) => {
    story.init(task);
    story.given("a loader that fails once and retry=1");

    let calls = 0;
    const source = createDataSource<string, string>({
      retry: 1,
      load: async () => {
        calls += 1;
        if (calls === 1) throw new Error("temporary");
        return "ok";
      },
    });

    story.when("the key is read");
    const result = await source.read("retry");

    story.then("the retry succeeds");
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("aborts an in-flight load", async ({ task }) => {
    story.init(task);
    story.given("an in-flight data source read");

    const source = createDataSource<string, string>({
      load: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          setTimeout(() => resolve("late"), 20);
        }),
    });

    story.when("the key is aborted");
    const pending = source.read("slow");
    source.abort("slow");

    story.then("the pending read rejects with AbortError");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(source.getSnapshot("slow")).toMatchObject({
      status: "error",
      loading: false,
    });
  });
});
