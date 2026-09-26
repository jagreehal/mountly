/** Putting a tree on the page, and changing only what differs the next time. */
import type { Catalog, CatalogElement, Tree } from "./catalog.js";

export interface RenderOptions {
  /** Called once per team embed the first time one of its tags appears. */
  onLoad?: (element: CatalogElement) => void;
}

/** What `render` put on the page last time, so the next render can change only what differs. */
interface Rendered {
  tag: string;
  slot?: string;
  el: Element;
  attrs: Map<string, string>;
  children: Rendered[];
}

const onPage = new WeakMap<Element, Rendered>();

/** How an attribute value is written: `true` as present, `false` as absent, objects as JSON. */
function attrText(value: unknown): string | undefined {
  if (value === false || value === undefined || value === null) return undefined;
  if (value === true) return "";
  return typeof value === "object"
    ? JSON.stringify(value)
    : String(value as string | number | boolean);
}

/**
 * Put a validated tree on the page. Throws, changing nothing, when the tree
 * fails {@link Catalog.validate}. Elements are created one by one — never
 * through `innerHTML` — and a team's embed script is added the first time one
 * of its tags appears; the team's code upgrades the element when it arrives.
 *
 * Rendering into the same target again changes only what differs: an element
 * whose tag and slot are unchanged at the same position is kept and has its
 * attributes updated, so its widget does not remount. That is what makes edit
 * turns and streamed trees cheap. Matching is by position only — no keys, no
 * move detection — so inserting before an element or reordering rebuilds, and
 * remounts, everything from that position on.
 */
export function render(
  tree: Tree,
  target: Element,
  catalog: Catalog,
  options: RenderOptions = {},
): void {
  const errors = catalog.validate(tree);
  if (errors.length) throw new Error(`[mountly-compose] invalid tree:\n${errors.join("\n")}`);
  const doc = target.ownerDocument;
  const byTag = new Map(catalog.elements.map((el) => [el.tag, el]));

  const load = (el: CatalogElement) => {
    if (!el.embed) return;
    const present = [...doc.querySelectorAll<HTMLScriptElement>("script[src]")].some(
      (script) => script.src === el.embed,
    );
    if (present) return;
    const script = doc.createElement("script");
    script.type = "module";
    script.src = el.embed;
    doc.head.append(script);
    options.onLoad?.(el);
  };

  const setAttrs = (was: Rendered | undefined, dom: Element, node: Tree) => {
    const attrs = new Map<string, string>();
    for (const [name, value] of Object.entries(node.attrs ?? {})) {
      const text = attrText(value);
      if (text !== undefined) attrs.set(name, text);
    }
    for (const name of was?.attrs.keys() ?? []) if (!attrs.has(name)) dom.removeAttribute(name);
    for (const [name, text] of attrs) {
      if (was?.attrs.get(name) !== text) dom.setAttribute(name, text);
    }
    // Host layout has no script to render its text; `text` is its content.
    const el = byTag.get(node.tag)!;
    if (
      el.team === "host" &&
      typeof node.attrs?.text === "string" &&
      dom.textContent !== node.attrs.text
    ) {
      dom.textContent = node.attrs.text;
    }
    return attrs;
  };

  const patch = (was: Rendered | undefined, node: Tree): Rendered => {
    const same = was && was.tag === node.tag && (was.slot ?? "") === (node.slot ?? "");
    const dom = same ? was.el : doc.createElement(node.tag);
    if (!same) {
      load(byTag.get(node.tag)!);
      if (node.slot) dom.setAttribute("slot", node.slot);
    }
    const attrs = setAttrs(same ? was : undefined, dom, node);
    const previous = same ? was.children : [];
    const children: Rendered[] = [];
    (node.children ?? []).forEach((child, index) => {
      const old = previous[index];
      const next = patch(old, child);
      if (next !== old) {
        if (old) old.el.replaceWith(next.el);
        // After the last kept sibling, wherever it now lives: a slotted
        // container moves its children into its widget's root once mounted.
        else if (children.length) children[children.length - 1]!.el.after(next.el);
        else dom.append(next.el);
      }
      children.push(next);
    });
    for (const gone of previous.slice(children.length)) gone.el.remove();
    return same
      ? Object.assign(was, { attrs, children })
      : { tag: node.tag, ...(node.slot ? { slot: node.slot } : {}), el: dom, attrs, children };
  };

  // Something else replaced the page since: start over rather than patch a ghost.
  const was = onPage.get(target);
  const current = was?.el.parentNode === target ? was : undefined;
  const next = patch(current, tree);
  if (next !== current) target.replaceChildren(next.el);
  onPage.set(target, next);
}
