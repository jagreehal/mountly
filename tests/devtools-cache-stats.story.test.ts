// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createDevtoolsPanel } from "../packages/mountly/src/devtools.js";
import { moduleCache, dataCache } from "../packages/mountly/src/cache.js";

describe("devtools cache stats", () => {
  afterEach(() => {
    moduleCache.clear();
    dataCache.clear();
    document.body.innerHTML = "";
  });

  it("displays real module and data cache sizes instead of hardcoded zeros", () => {
    moduleCache.set("mod-a", { default: () => {} });
    moduleCache.set("mod-b", { default: () => {} });
    dataCache.set("key-1", { value: 42 });

    const { destroy } = createDevtoolsPanel();

    const statValues = document.querySelectorAll(
      "[data-mountly-devtools-stat-value]",
    );
    const labels = document.querySelectorAll(
      "[data-mountly-devtools-stat-label]",
    );

    const moduleStat = Array.from(labels).find(
      (l) => l.textContent === "Modules",
    );
    const dataStat = Array.from(labels).find(
      (l) => l.textContent === "Data entries",
    );

    const moduleValue =
      moduleStat?.parentElement?.querySelector(
        "[data-mountly-devtools-stat-value]",
      )?.textContent;
    const dataValue =
      dataStat?.parentElement?.querySelector(
        "[data-mountly-devtools-stat-value]",
      )?.textContent;

    expect(moduleValue).toBe("2");
    expect(dataValue).toBe("1");

    destroy();
  });
});
