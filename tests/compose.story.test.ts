// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import {
  connectView,
  createCatalog,
  DEFAULT_LAYOUT,
  elementsFromCem,
  loadCatalog,
  parsePartialTree,
  render,
  type Tree,
} from "../packages/mountly-compose/src/index";

/** What the embed build writes for one team. */
const BILLING_CEM = {
  modules: [
    {
      declarations: [
        {
          kind: "class",
          customElement: true,
          tagName: "billing-invoice-list",
          description: "A customer's invoices.",
          attributes: [
            { name: "customer-id", type: { text: "string" }, description: "Customer id." },
            { name: "status", type: { text: '"paid" | "overdue" | "all"' } },
          ],
          events: [{ name: "pick-invoice", description: "Detail: `{ invoiceId }`." }],
        },
      ],
    },
  ],
};

const catalog = () =>
  createCatalog([
    ...DEFAULT_LAYOUT,
    ...elementsFromCem(BILLING_CEM, "billing", "https://cdn.test/billing/embed.js"),
  ]);

describe("A catalog read from teams' custom-elements.json", () => {
  it("loads every team the registry names, resolving paths against it", async ({ task }) => {
    story.init(task);
    story.given("a registry pointing at one team's embed and description file");

    const files: Record<string, string> = {
      "https://host.test/registry.json": JSON.stringify({
        teams: [{ id: "billing", embed: "billing/embed.js", elements: "billing/cem.json" }],
      }),
      "https://host.test/billing/cem.json": JSON.stringify(BILLING_CEM),
    };
    const loaded = await loadCatalog("https://host.test/registry.json", {
      read: async (url) => files[url.href]!,
    });

    story.then("the team's element carries its embed URL and its literal values");
    const invoices = loaded.elements.find((el) => el.tag === "billing-invoice-list")!;
    expect(invoices.embed).toBe("https://host.test/billing/embed.js");
    expect(invoices.attributes[1]).toMatchObject({
      name: "status",
      values: ["paid", "overdue", "all"],
    });
    expect(loaded.elements.map((el) => el.tag)).toContain("ui-stack");
  });

  it("drives the prompt, the menu and the JSON Schema from one object", ({ task }) => {
    story.init(task);

    const c = catalog();
    story.then("the prompt shows descriptions and types, but not events");
    expect(c.prompt()).toContain("<billing-invoice-list> — A customer's invoices.");
    expect(c.prompt()).toContain('status: "paid" | "overdue" | "all"');
    expect(c.prompt()).not.toContain("pick-invoice");
    expect(c.prompt({ output: "html" })).toContain("Reply with HTML only");

    story.then("the menu lists team widgets only, one line each");
    expect(c.menu()).toBe("billing-invoice-list — A customer's invoices.");

    story.then("the schema enumerates literal values, so a local model cannot sample others");
    const defs = c.jsonSchema().$defs as Record<string, any>;
    expect(defs["billing-invoice-list"].properties.attrs.properties.status.enum).toEqual([
      "paid",
      "overdue",
      "all",
    ]);
    expect(c.jsonSchema().$ref).toBe("#/$defs/ui-stack");
  });

  it("rejects anything the catalog does not allow", ({ task }) => {
    story.init(task);
    story.given("a tree with every kind of mistake models make");

    const errors = catalog().validate({
      tag: "ui-stack",
      children: [
        { tag: "billing-invoice-list", attrs: { status: "late", colour: "red" } },
        { tag: "billing-invoice-list", attrs: { "customer-id": { $state: "/id" } } },
        { tag: "ui-note", attrs: { text: "hi" }, children: [{ tag: "ui-stack" }] },
        { tag: "script" },
        "text",
      ],
    });

    story.then("each is named with its position");
    expect(errors).toEqual([
      'root/0: <billing-invoice-list status="late"> is not one of paid|overdue|all',
      'root/0: <billing-invoice-list> has no attribute "colour"',
      'root/1: <billing-invoice-list customer-id> must be a literal, got {"$state":"/id"}',
      "root/2: <ui-note> takes no children",
      "root/3: unknown tag <script>",
      "root/4: not an element",
    ]);
    expect(catalog().validate({ tag: "ui-stack", children: [] })).toEqual([]);

    story.then("a widget the turn requires is reported when it is missing");
    expect(
      catalog().validate({ tag: "ui-stack", children: [] }, { require: ["billing-invoice-list"] }),
    ).toEqual(["root: missing <billing-invoice-list>"]);
  });

  it("narrows to host layout plus the tags a first pass picked", ({ task }) => {
    story.init(task);

    const narrowed = catalog().narrow([]);
    expect(narrowed.elements.map((el) => el.tag)).toEqual(["ui-stack", "ui-grid", "ui-note"]);
  });
});

describe("Turns that edit the page instead of starting over", () => {
  it("sends the current page and the event, described by the team", ({ task }) => {
    story.init(task);
    story.given("a page on screen and a widget event");

    const current: Tree = {
      tag: "ui-stack",
      children: [{ tag: "billing-invoice-list", attrs: { "customer-id": "cus_1" } }],
    };
    const message = catalog().turn({
      context: "Signed-in customer: cus_1.",
      current,
      event: { name: "pick-invoice", tag: "billing-invoice-list", detail: { invoiceId: "INV-1" } },
    });

    story.then("the model sees what is there, what happened, and what the event means");
    expect(message).toContain("Context: Signed-in customer: cus_1.");
    expect(message).toContain(JSON.stringify(current));
    expect(message).toContain("keep every element that still helps");
    expect(message).toContain(
      'The user just did "pick-invoice" on <billing-invoice-list> with {"invoiceId":"INV-1"}. (Detail: `{ invoiceId }`.)',
    );
    expect(catalog().turn({ request: "Where's my parcel?" })).toBe("Request: Where's my parcel?");
  });
});

describe("Rendering", () => {
  it("builds elements one by one and loads each team's code once", ({ task }) => {
    story.init(task);
    story.given("a tree using one team's widget twice and host layout");

    document.head.replaceChildren();
    const target = document.createElement("main");
    const loaded: string[] = [];
    const tree: Tree = {
      tag: "ui-stack",
      children: [
        { tag: "ui-note", attrs: { text: "<img src=x onerror=alert(1)>" } },
        { tag: "billing-invoice-list", attrs: { "customer-id": "cus_1", status: "overdue" } },
        { tag: "billing-invoice-list", attrs: { "customer-id": "cus_2" } },
      ],
    };
    render(tree, target, catalog(), { onLoad: (el) => loaded.push(el.team) });
    render(tree, target, catalog(), { onLoad: (el) => loaded.push(el.team) });

    story.then("the embed script is added once, and text stays text");
    expect(loaded).toEqual(["billing"]);
    expect(document.head.querySelectorAll("script[type=module]")).toHaveLength(1);
    expect(target.querySelector("ui-note")!.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(target.querySelector("img")).toBeNull();
    expect(target.querySelector("billing-invoice-list")!.getAttribute("status")).toBe("overdue");
  });

  it("renders nothing when the tree is invalid", ({ task }) => {
    story.init(task);

    const target = document.createElement("main");
    target.append("previous page");
    expect(() => render({ tag: "script" }, target, catalog())).toThrow(/unknown tag <script>/);
    expect(target.textContent).toBe("previous page");
  });
});

describe("Host actions for widget events", () => {
  const actions = {
    "show-invoice": {
      description: "Show that invoice in full.",
      on: ["billing-invoice-list:pick-invoice"],
      params: ["invoiceId"],
      show: ["billing-invoice-list"],
    },
  };
  const elements = () => [
    ...DEFAULT_LAYOUT,
    ...elementsFromCem(BILLING_CEM, "billing", "https://cdn.test/billing/embed.js"),
  ];

  it("turns a widget event into a named action with only its declared params", ({ task }) => {
    story.init(task);
    story.given("an action mapped to the invoice list's pick-invoice event");

    const c = createCatalog(elements(), { actions });
    const event = {
      name: "pick-invoice",
      tag: "billing-invoice-list",
      detail: { invoiceId: "INV-1", internalRowIndex: 3 },
    };

    story.then("the model is told the action, its params and what to draw on");
    expect(c.action(event)).toEqual({
      name: "show-invoice",
      description: "Show that invoice in full.",
      params: { invoiceId: "INV-1" },
      show: ["billing-invoice-list"],
    });
    expect(c.turn({ event })).toBe(
      'The user chose "show-invoice" with {"invoiceId":"INV-1"}: Show that invoice in full. The page must include <billing-invoice-list>.',
    );
    expect(c.prompt()).toContain(
      "- show-invoice — Show that invoice in full. From billing-invoice-list:pick-invoice.",
    );

    story.then("hosts listen only for events that have an action");
    expect(c.triggers()).toEqual(["pick-invoice"]);
    expect(createCatalog(elements()).triggers()).toEqual(["pick-invoice"]);
    expect(c.action({ name: "other", tag: "billing-invoice-list" })).toBeUndefined();
  });

  it("refuses an action that could never fire", ({ task }) => {
    story.init(task);
    story.given("a misspelt event, and a tag no team publishes");

    expect(() =>
      createCatalog(elements(), {
        actions: { x: { description: "", on: ["billing-invoice-list:pick"] } },
      }),
    ).toThrow('action "x": no <billing-invoice-list> declares "pick"');
    expect(() =>
      createCatalog(elements(), {
        actions: { x: { description: "", on: [], show: ["billing-nope"] } },
      }),
    ).toThrow('action "x": unknown tag <billing-nope>');

    story.then("narrowing drops actions whose widgets are gone, rather than failing");
    expect(createCatalog(elements(), { actions }).narrow([]).actions).toEqual({});
  });
});

describe("Answering an action", () => {
  it("gives the model no free text unless the action asks for it", ({ task }) => {
    story.init(task);
    story.given("a page that already has a note, and an action that shows no note");

    const c = createCatalog([
      ...DEFAULT_LAYOUT,
      ...elementsFromCem(BILLING_CEM, "billing", "https://cdn.test/billing/embed.js"),
    ]);
    const current: Tree = {
      tag: "ui-stack",
      children: [{ tag: "ui-note", attrs: { text: "Sorry about that." } }],
    };
    const quiet = { name: "a", description: "", params: {}, show: ["billing-invoice-list"] };

    story.then("the note is not in the catalog for that turn, so it cannot be written");
    expect(c.forAction(quiet, current).elements.map((el) => el.tag)).toEqual([
      "ui-stack",
      "ui-grid",
      "billing-invoice-list",
    ]);
    expect(c.forAction({ ...quiet, show: ["ui-note"] }).elements.map((el) => el.tag)).toContain(
      "ui-note",
    );
  });
});

describe("Props with a schema from the build", () => {
  const cem = {
    modules: [
      {
        declarations: [
          {
            customElement: true,
            tagName: "billing-invoice-list",
            attributes: [
              {
                name: "limit",
                type: { text: "number" },
                schema: { type: "number", minimum: 1, maximum: 20 },
              },
              {
                name: "lines",
                type: { text: "Line[]" },
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { label: { type: "string" }, amount: { type: "number" } },
                    required: ["label", "amount"],
                    additionalProperties: false,
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const c = () => createCatalog([...DEFAULT_LAYOUT, ...elementsFromCem(cem, "billing")]);
  const list = (attrs: Record<string, unknown>): Tree => ({
    tag: "ui-stack",
    children: [{ tag: "billing-invoice-list", attrs }],
  });

  it("checks values against the schema, reading HTML text the way the element will", ({ task }) => {
    story.init(task);

    story.then("in-range numbers pass, whether written as JSON or as attribute text");
    expect(c().validate(list({ limit: 5 }))).toEqual([]);
    expect(c().validate(list({ limit: "5" }))).toEqual([]);

    story.then("bounds, types and object shapes are reported with where they failed");
    expect(c().validate(list({ limit: 50 }))).toEqual([
      "root/0: <billing-invoice-list limit> must be at most 20",
    ]);
    expect(c().validate(list({ limit: "lots" }))).toEqual([
      'root/0: <billing-invoice-list limit="lots"> must be a number, got "lots"',
    ]);
    expect(
      c().validate(list({ lines: [{ label: "Rent" }, { label: "Tax", amount: 3, x: 1 }] })),
    ).toEqual([
      'root/0: <billing-invoice-list lines> [0] is missing "amount"',
      'root/0: <billing-invoice-list lines> [1] has no "x"',
    ]);

    story.then("the JSON Schema for constrained decoding carries the same constraints");
    const defs = c().jsonSchema().$defs as Record<string, any>;
    expect(defs["billing-invoice-list"].properties.attrs.properties.limit).toEqual({
      type: "number",
      minimum: 1,
      maximum: 20,
    });
  });

  it("renders object values as JSON attributes", ({ task }) => {
    story.init(task);

    const target = document.createElement("main");
    render(list({ lines: [{ label: "Rent", amount: 900 }] }), target, c());
    expect(target.querySelector("billing-invoice-list")!.getAttribute("lines")).toBe(
      '[{"label":"Rent","amount":900}]',
    );
  });

  it("repairs small mistakes instead of asking the model again", ({ task }) => {
    story.init(task);
    story.given("a tree with an invented tag, a bad value and a stray attribute");

    const { tree, dropped } = c().repair({
      tag: "ui-stack",
      children: [
        { tag: "billing-invoice-list", attrs: { limit: 50, colour: "red" } },
        { tag: "billing-refund-wizard" },
        { tag: "ui-note", attrs: { text: "Hi" }, children: [{ tag: "ui-stack" }] },
      ],
    });

    story.then("what is valid stays, and everything removed is listed");
    expect(tree).toEqual({
      tag: "ui-stack",
      attrs: {},
      children: [
        { tag: "billing-invoice-list", attrs: {}, children: [] },
        { tag: "ui-note", attrs: { text: "Hi" }, children: [] },
      ],
    });
    expect(dropped).toEqual([
      "root/0: <billing-invoice-list limit>",
      "root/0: <billing-invoice-list colour>",
      "root/1: <billing-refund-wizard>",
      "root/2: children of <ui-note>",
    ]);
    expect(c().validate(tree)).toEqual([]);
  });
});

describe("Team components with slots", () => {
  const cem = {
    modules: [
      {
        declarations: [
          {
            customElement: true,
            tagName: "cases-case-panel",
            description: "A titled panel collecting one customer issue.",
            attributes: [{ name: "title", type: { text: "string" } }],
            slots: [
              { name: "", description: "What the case is about" },
              { name: "actions", description: "Buttons along the bottom" },
            ],
          },
        ],
      },
    ],
  };
  const c = () =>
    createCatalog([
      ...DEFAULT_LAYOUT,
      ...elementsFromCem(cem, "cases"),
      ...elementsFromCem(BILLING_CEM, "billing"),
    ]);

  it("lets a team component hold other teams' widgets, in the slots it declares", ({ task }) => {
    story.init(task);

    const panel = c().elements.find((el) => el.tag === "cases-case-panel")!;
    expect(panel.leaf).toBe(false);
    expect(c().prompt()).toContain(
      "<cases-case-panel> (slots: default — What the case is about; actions — Buttons along the bottom)",
    );
    expect(c().prompt()).toContain('sets "slot" to that name; everywhere else, leave "slot" out');
    const defs = c().jsonSchema().$defs as Record<string, any>;
    // Only real names: a model cannot write `"slot": "default"`.
    expect(defs["ui-note"].properties.slot).toEqual({ enum: ["actions"] });

    const tree: Tree = {
      tag: "ui-stack",
      children: [
        {
          tag: "cases-case-panel",
          attrs: { title: "Double charge" },
          children: [
            { tag: "billing-invoice-list", attrs: { "customer-id": "cus_1" } },
            { tag: "ui-note", attrs: { text: "Open a dispute?" }, slot: "actions" },
          ],
        },
      ],
    };
    expect(c().validate(tree)).toEqual([]);

    story.then(
      "a slot the parent does not render is reported; repair keeps the child as default content",
    );
    const wrong: Tree = {
      tag: "ui-stack",
      children: [
        {
          tag: "cases-case-panel",
          children: [{ tag: "ui-note", attrs: { text: "x" }, slot: "footer" }],
        },
        { tag: "ui-note", attrs: { text: "y" }, slot: "actions" },
      ],
    };
    expect(c().validate(wrong)).toEqual([
      'root/0/0: <cases-case-panel> has no slot "footer"',
      'root/1: <ui-stack> has no slot "actions"',
    ]);
    expect(c().repair(wrong).tree).toEqual({
      tag: "ui-stack",
      attrs: {},
      children: [
        {
          tag: "cases-case-panel",
          attrs: {},
          children: [{ tag: "ui-note", attrs: { text: "x" }, children: [] }],
        },
        { tag: "ui-note", attrs: { text: "y" }, children: [] },
      ],
    });

    story.then("the rendered child carries its slot attribute");
    const target = document.createElement("main");
    render(tree, target, c());
    expect(target.querySelector("cases-case-panel > ui-note")!.getAttribute("slot")).toBe(
      "actions",
    );
  });
});

describe("Rendering again", () => {
  it("keeps the elements that did not change, so their widgets do not remount", ({ task }) => {
    story.init(task);
    story.given("a page with a list, then an edit that filters it and adds a note");

    const c = catalog();
    const target = document.createElement("main");
    render(
      {
        tag: "ui-stack",
        children: [
          { tag: "billing-invoice-list", attrs: { "customer-id": "cus_1", status: "all" } },
        ],
      },
      target,
      c,
    );
    const list = target.querySelector("billing-invoice-list")!;
    render(
      {
        tag: "ui-stack",
        children: [
          { tag: "billing-invoice-list", attrs: { "customer-id": "cus_1", status: "overdue" } },
          { tag: "ui-note", attrs: { text: "Two are overdue." } },
        ],
      },
      target,
      c,
    );

    story.then("the same element is still there, with only its changed attribute updated");
    expect(target.querySelector("billing-invoice-list")).toBe(list);
    expect(list.getAttribute("status")).toBe("overdue");
    expect(target.querySelector("ui-note")!.textContent).toBe("Two are overdue.");

    story.then("an element that goes away is removed, and an attribute dropped is removed");
    render(
      {
        tag: "ui-stack",
        children: [{ tag: "billing-invoice-list", attrs: { "customer-id": "cus_1" } }],
      },
      target,
      c,
    );
    expect(target.querySelector("billing-invoice-list")).toBe(list);
    expect(list.hasAttribute("status")).toBe(false);
    expect(target.querySelector("ui-note")).toBeNull();

    story.then("a different tag in that place is a new element");
    render({ tag: "ui-stack", children: [{ tag: "ui-note", attrs: { text: "x" } }] }, target, c);
    expect(list.isConnected).toBe(false);
  });
});

describe("Streaming", () => {
  const full: Tree = {
    tag: "ui-stack",
    attrs: {},
    children: [
      { tag: "ui-note", attrs: { text: 'Say "hi" \\ bye' }, children: [] },
      {
        tag: "billing-invoice-list",
        attrs: { "customer-id": "cus_1", status: "overdue" },
        children: [],
      },
    ],
  };
  const text = `Here you go:\n${JSON.stringify(full, null, 1)}`;

  it("shows each element once its attributes are complete, never half of them", ({ task }) => {
    story.init(task);
    story.given("a reply arriving one character at a time, with a sentence before it");

    const seen: string[] = [];
    for (let end = 1; end <= text.length; end++) {
      const tree = parsePartialTree(text.slice(0, end));
      if (!tree) continue;
      for (const child of tree.children ?? []) {
        // Never a list without its status, or a note with a cut-off text.
        expect(child).toEqual(full.children!.find((c) => c.tag === child.tag));
      }
      const tags = (tree.children ?? []).map((child) => child.tag).join(",");
      if (seen.at(-1) !== tags) seen.push(tags);
    }

    story.then("the page grows element by element and ends as the whole tree");
    expect(seen).toEqual(["", "ui-note", "ui-note,billing-invoice-list"]);
    expect(parsePartialTree(text)).toEqual(full);
    expect(parsePartialTree("Thinking…")).toBeUndefined();
  });

  it("renders each partial tree in place as it grows", ({ task }) => {
    story.init(task);

    const c = catalog();
    const target = document.createElement("main");
    let first: Element | null = null;
    for (let end = 1; end <= text.length; end++) {
      const partial = c.repair(parsePartialTree(text.slice(0, end))).tree;
      if (!partial) continue;
      render(partial, target, c);
      first ??= target.querySelector("ui-note");
    }
    expect(target.querySelector("ui-note")).toBe(first);
    expect(target.querySelector("billing-invoice-list")!.getAttribute("status")).toBe("overdue");
  });
});

describe("Inside an MCP Apps view", () => {
  const payload = () => ({
    page: {
      tag: "ui-stack",
      children: [{ tag: "billing-invoice-list", attrs: { "customer-id": "cus_1" } }],
    },
    elements: [
      ...DEFAULT_LAYOUT,
      ...elementsFromCem(BILLING_CEM, "billing", "https://cdn.test/billing/embed.js"),
    ],
    actions: {
      "show-invoice": {
        description: "Show that invoice.",
        on: ["billing-invoice-list:pick-invoice"],
        params: ["invoiceId"],
      },
    },
  });
  /** Stands in for `@modelcontextprotocol/ext-apps`'s `App`. */
  const fakeApp = () => {
    const sent: string[] = [];
    const logged: string[] = [];
    const app = {
      ontoolresult: undefined as ((params: { structuredContent?: unknown }) => void) | undefined,
      sendMessage: (message: { content: Array<{ text: string }> }) =>
        sent.push(message.content[0]!.text),
      sendLog: ({ data }: { data: string }) => logged.push(data),
    };
    return { app, sent, logged };
  };

  it("renders each tool result, and sends an action back as the agent's next turn", ({ task }) => {
    story.init(task);
    const { app, sent } = fakeApp();
    const target = document.createElement("main");
    document.body.append(target);
    connectView(app, target, { request: "Show the updated page with show_page." });

    story.given("the host delivers a page");
    app.ontoolresult!({ structuredContent: payload() });
    const list = target.querySelector("billing-invoice-list")!;
    expect(list.getAttribute("customer-id")).toBe("cus_1");

    story.when("the user picks an invoice, and does something no action covers");
    list.dispatchEvent(
      new CustomEvent("pick-invoice", { detail: { invoiceId: "INV-1" }, bubbles: true }),
    );
    list.dispatchEvent(new CustomEvent("other", { bubbles: true }));

    story.then("one message goes to the agent: the page, the action, and the request");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('"customer-id":"cus_1"');
    expect(sent[0]).toContain('The user chose "show-invoice" with {"invoiceId":"INV-1"}');
    expect(sent[0]).toContain("Request: Show the updated page with show_page.");

    story.then("a second result keeps the same listeners: one click, one message");
    app.ontoolresult!({ structuredContent: payload() });
    target
      .querySelector("billing-invoice-list")!
      .dispatchEvent(
        new CustomEvent("pick-invoice", { detail: { invoiceId: "INV-2" }, bubbles: true }),
      );
    expect(sent).toHaveLength(2);
    target.remove();
  });

  it("reports a result it cannot render instead of showing nothing", ({ task }) => {
    story.init(task);
    const { app, logged } = fakeApp();
    connectView(app, document.createElement("main"));

    app.ontoolresult!({ structuredContent: { ...payload(), page: { tag: "script" } } });
    app.ontoolresult!({ structuredContent: { content: "no page here" } });
    expect(logged).toEqual([expect.stringContaining("unknown tag <script>")]);
  });
});
