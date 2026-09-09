import { afterEach, expect, test, vi } from "vitest";
import {
  defineElements,
  type MountlyElement,
  type PropSpec,
} from "../../packages/mountly/src/embed";
import type { WidgetModule } from "../../packages/mountly/src/adapter";

let serial = 0;
const tag = () => `embed-check-${++serial}`;
afterEach(() => {
  document.body.replaceChildren();
});

/** Renders whatever props it is given, so assertions read the real prop values. */
function widget(): WidgetModule {
  const render = (el: Element, props: unknown) => {
    el.textContent = JSON.stringify(props, (_key, value) =>
      typeof value === "function" ? "[fn]" : value,
    );
  };
  return { mount: render, update: render, unmount: (el) => el.replaceChildren() };
}

const PAYMENTS: PropSpec[] = [
  { name: "balance", attribute: "balance", kind: "number" },
  { name: "currency", attribute: "currency", kind: "string" },
  { name: "compact", attribute: "compact", kind: "boolean" },
  { name: "lineItems", attribute: "line-items", kind: "json" },
  { name: "onViewDetails", kind: "event", event: "view-details" },
];

const props = (el: Element) => JSON.parse(el.textContent!) as Record<string, unknown>;

test("coerces attributes by their declared type and keeps registration lazy", async () => {
  const name = tag();
  const loader = vi.fn(async () => widget());
  defineElements({ [name]: { load: loader, props: PAYMENTS, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement;
  el.setAttribute("balance", "1250");
  el.setAttribute("currency", "GBP");
  el.setAttribute("line-items", '[{"label":"Subs","amount":1200}]');
  el.textContent = "Loading…";
  document.body.append(el);
  await Promise.resolve();

  expect(loader).not.toHaveBeenCalled();
  expect(el.textContent).toContain("Loading…");

  await el.mount();
  expect(props(el)).toEqual({
    balance: 1250,
    currency: "GBP",
    compact: false,
    lineItems: [{ label: "Subs", amount: 1200 }],
    onViewDetails: "[fn]",
  });
});

test("treats boolean props the way HTML does", async () => {
  const name = tag();
  defineElements({ [name]: { load: async () => widget(), props: PAYMENTS, trigger: "never" } });
  const el = document.createElement(name) as MountlyElement;
  document.body.append(el);

  await el.mount();
  expect(props(el).compact).toBe(false);

  el.setAttribute("compact", "");
  await expect.poll(() => props(el).compact).toBe(true);

  el.setAttribute("compact", "false");
  await expect.poll(() => props(el).compact).toBe(false);

  el.setAttribute("compact", "compact");
  await expect.poll(() => props(el).compact).toBe(true);

  el.removeAttribute("compact");
  await expect.poll(() => props(el).compact).toBe(false);
});

test("exposes real properties that update in place and outrank attributes", async () => {
  const name = tag();
  defineElements({ [name]: { load: async () => widget(), props: PAYMENTS, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement<{
    balance: number;
    lineItems: Array<{ label: string; amount: number }>;
  }>;
  el.setAttribute("balance", "1");
  // Assigned before the element upgrades, as a deferred embed script allows.
  el.balance = 2;
  document.body.append(el);
  await el.mount();
  expect(props(el).balance).toBe(2);
  expect(el.balance).toBe(2);

  const root = el.querySelector("[data-mountly-embed-root]");
  el.lineItems = [{ label: "Tax", amount: 5 }];
  await expect.poll(() => props(el).lineItems).toEqual([{ label: "Tax", amount: 5 }]);
  // Updating props must not remount: the component keeps its own state.
  expect(el.querySelector("[data-mountly-embed-root]")).toBe(root);
});

test("turns callback props into bubbling DOM events", async () => {
  const name = tag();
  let callback!: (detail: unknown) => void;
  const mod = widget();
  const render = mod.mount.bind(mod);
  mod.mount = (el, incoming) => {
    callback = (incoming as { onViewDetails: (d: unknown) => void }).onViewDetails;
    return render(el, incoming);
  };
  defineElements({ [name]: { load: async () => mod, props: PAYMENTS, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement;
  document.body.append(el);
  await el.mount();

  const seen = vi.fn();
  document.body.addEventListener("view-details", seen, { once: true });
  callback({ balance: 7 });
  expect(seen.mock.calls[0]?.[0].detail).toEqual({ balance: 7 });
});

test("keeps the latest values through download and asynchronous mounting", async () => {
  const name = tag();
  let finishLoad!: (value: WidgetModule) => void;
  let finishMount!: () => void;
  const pendingLoad = new Promise<WidgetModule>((resolve) => {
    finishLoad = resolve;
  });
  const pendingMount = new Promise<void>((resolve) => {
    finishMount = resolve;
  });
  const mod = widget();
  const render = mod.mount.bind(mod);
  const started = vi.fn();
  mod.mount = async (el, incoming) => {
    started(incoming);
    await pendingMount;
    render(el, incoming);
  };
  defineElements({ [name]: { load: () => pendingLoad, props: PAYMENTS } });

  const el = document.createElement(name) as MountlyElement;
  document.body.append(el);
  const mounting = el.mount();
  (el as MountlyElement<{ balance: number }>).balance = 2;
  finishLoad(mod);
  await expect.poll(() => started.mock.calls.length).toBe(1);
  expect((started.mock.calls[0]?.[0] as { balance: number }).balance).toBe(2);

  el.setAttribute("balance", "3");
  finishMount();
  await mounting;
  expect(props(el).balance).toBe(3);
});

test("reports invalid JSON, recovers with valid values, and retries loader failures", async () => {
  const name = tag();
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const loader = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(widget());
  defineElements({ [name]: { load: loader, props: PAYMENTS, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement;
  const onError = vi.fn();
  el.addEventListener("mountly:error", onError);
  el.setAttribute("line-items", "{oops");
  document.body.append(el);
  await el.mount();
  expect(el.dataset.mountlyState).toBe("error");
  expect(loader).not.toHaveBeenCalled();

  el.setAttribute("line-items", "[]");
  await el.mount();
  // First loader call rejects; the element stays retryable rather than stuck.
  expect(el.dataset.mountlyState).toBe("error");
  await el.mount();
  expect(props(el).lineItems).toEqual([]);
  expect(onError.mock.calls.length).toBeGreaterThanOrEqual(2);
  errors.mockRestore();
});

test("keeps an element in error until the bad attribute itself is fixed", async () => {
  const name = tag();
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const loader = vi.fn(async () => widget());
  defineElements({ [name]: { load: loader, props: PAYMENTS, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement;
  el.setAttribute("line-items", "{oops");
  document.body.append(el);
  await el.mount();
  expect(el.dataset.mountlyState).toBe("error");

  // Writing a *different*, valid prop must not paper over the broken one.
  el.setAttribute("currency", "GBP");
  await el.mount();
  expect(el.dataset.mountlyState).toBe("error");
  expect(loader).not.toHaveBeenCalled();

  // Fixing the offending attribute is what clears it.
  el.setAttribute("line-items", "[]");
  await el.mount();
  expect(props(el)).toMatchObject({ currency: "GBP", lineItems: [] });
  expect(el.dataset.mountlyState).toBe("mounted");
  errors.mockRestore();
});

test("a mounted element stays mounted when an attribute changes", async () => {
  const name = tag();
  defineElements({ [name]: { load: async () => widget(), props: PAYMENTS, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement;
  el.setAttribute("balance", "1");
  document.body.append(el);
  await el.mount();
  expect(el.dataset.mountlyState).toBe("mounted");

  el.setAttribute("balance", "2");
  await expect.poll(() => props(el).balance).toBe(2);
  // An ordinary update must not knock a live element back to idle.
  expect(el.dataset.mountlyState).toBe("mounted");
});

test("a property assignment recovers the prop it names, and only that one", async () => {
  const name = tag();
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  defineElements({ [name]: { load: async () => widget(), props: PAYMENTS, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement<{
    lineItems: unknown[];
    currency: string;
  }>;
  el.setAttribute("line-items", "{oops");
  el.setAttribute("currency", "}also-bad");
  document.body.append(el);
  await el.mount();
  expect(el.dataset.mountlyState).toBe("error");

  // Property beats attribute, so assigning a good value must clear that error.
  el.lineItems = [];
  await el.mount();
  // `currency` is fine (a string attribute never fails), so this recovers.
  expect(el.dataset.mountlyState).toBe("mounted");
  expect(props(el).lineItems).toEqual([]);
  errors.mockRestore();
});

test("a property assignment leaves another prop's error standing", async () => {
  const name = tag();
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const specs = [...PAYMENTS, { name: "meta", attribute: "meta", kind: "json" as const }];
  defineElements({ [name]: { load: async () => widget(), props: specs, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement<{ balance: number }>;
  el.setAttribute("line-items", "{oops");
  el.setAttribute("meta", "{also-oops");
  document.body.append(el);
  await el.mount();
  expect(el.dataset.mountlyState).toBe("error");

  // Fixing one of two broken props must not declare the element healthy.
  el.setAttribute("line-items", "[]");
  await el.mount();
  expect(el.dataset.mountlyState).toBe("error");

  el.setAttribute("meta", "{}");
  await el.mount();
  expect(el.dataset.mountlyState).toBe("mounted");
  errors.mockRestore();
});

test("names the offending prop on the error event", async () => {
  const name = tag();
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  defineElements({ [name]: { load: async () => widget(), props: PAYMENTS, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement;
  const onError = vi.fn();
  el.addEventListener("mountly:error", onError);
  el.setAttribute("line-items", "{oops");
  document.body.append(el);
  await el.mount();

  expect(onError.mock.calls[0]?.[0].detail).toMatchObject({ prop: "lineItems" });
  errors.mockRestore();
});

test("guesses only for untyped props, and never mangles a string that looks numeric", async () => {
  const name = tag();
  const untyped: PropSpec[] = [
    { name: "version", attribute: "version", kind: "auto" },
    { name: "count", attribute: "count", kind: "auto" },
    { name: "postcode", attribute: "postcode", kind: "auto" },
    { name: "flag", attribute: "flag", kind: "auto" },
    { name: "items", attribute: "items", kind: "auto" },
  ];
  defineElements({ [name]: { load: async () => widget(), props: untyped, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement;
  el.setAttribute("version", "1.0");
  el.setAttribute("count", "1250");
  el.setAttribute("postcode", "01234");
  el.setAttribute("flag", "true");
  el.setAttribute("items", '["a"]');
  document.body.append(el);
  await el.mount();

  expect(props(el)).toEqual({
    version: "1.0",
    count: 1250,
    postcode: "01234",
    flag: true,
    items: ["a"],
  });
});

test("removal during loading does not resurrect the element, and it remounts after reconnect", async () => {
  const name = tag();
  let finish!: (value: WidgetModule) => void;
  const loaded = new Promise<WidgetModule>((resolve) => {
    finish = resolve;
  });
  const loader = vi.fn(() => loaded);
  defineElements({ [name]: { load: loader, props: PAYMENTS, trigger: "never" } });

  const el = document.createElement(name) as MountlyElement;
  el.setAttribute("balance", "9");
  document.body.append(el);
  const mounting = el.mount();
  el.remove();

  const mod = widget();
  const render = vi.spyOn(mod, "mount");
  finish(mod);
  await mounting;
  expect(render).not.toHaveBeenCalled();

  document.body.append(el);
  await el.mount();
  expect(props(el).balance).toBe(9);
  expect(loader).toHaveBeenCalledTimes(1);
});

test("refuses to define the same tag twice", () => {
  const name = tag();
  const definition = { load: async () => widget(), props: PAYMENTS };
  defineElements({ [name]: definition });
  expect(() => defineElements({ [name]: definition })).toThrow(/already defined/);
});

test("a component may have props named trigger and mount", async () => {
  const name = tag();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  defineElements({
    [name]: {
      load: async () => widget(),
      props: [
        { name: "trigger", attribute: "trigger", kind: "string" },
        { name: "mount", attribute: "mount", kind: "string" },
        { name: "balance", attribute: "balance", kind: "number" },
      ],
      trigger: "never",
    },
  });

  const el = document.createElement(name) as MountlyElement;
  el.setAttribute("trigger", "hover");
  el.setAttribute("mount", "left");
  el.setAttribute("balance", "3");
  document.body.append(el);

  // `mount()` is still the element's control method, not a string.
  expect(typeof el.mount).toBe("function");
  await el.mount();

  // Both reach the component rather than being swallowed as configuration.
  expect(props(el)).toMatchObject({ trigger: "hover", mount: "left", balance: 3 });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('"mount" collides'));
  warn.mockRestore();
});

test("takes its own load trigger from a namespaced attribute", async () => {
  const name = tag();
  const loader = vi.fn(async () => widget());
  defineElements({ [name]: { load: loader, props: PAYMENTS } });

  const el = document.createElement(name) as MountlyElement;
  el.setAttribute("data-mountly-trigger", "never");
  el.setAttribute("balance", "5");
  document.body.append(el);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(loader).not.toHaveBeenCalled();
  await el.mount();
  expect(props(el).balance).toBe(5);
});

test("never shadows a built-in element property, but still feeds the prop", async () => {
  const name = tag();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  defineElements({
    [name]: {
      load: async () => widget(),
      props: [
        { name: "title", attribute: "title", kind: "string" },
        { name: "balance", attribute: "balance", kind: "number" },
      ],
      trigger: "never",
    },
  });

  const el = document.createElement(name) as MountlyElement;
  el.setAttribute("title", "Payments");
  el.setAttribute("balance", "3");
  document.body.append(el);
  await el.mount();

  // The component sees the prop, and `title` keeps its native DOM meaning.
  expect(props(el).title).toBe("Payments");
  expect(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "title")).toBeUndefined();
  expect(el.title).toBe("Payments");
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("collides with an element property"));
  warn.mockRestore();
});
