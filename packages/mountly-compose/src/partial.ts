/** Reading a model's reply while it is still streaming in. */
import type { Tree } from "./catalog.js";

/**
 * The tree so far, from a model's reply that is still streaming in. An element
 * appears once its tag and attributes are complete; its children follow as
 * they complete. Text that is not a tree yet gives `undefined`. Pair it with
 * {@link Catalog.repair} and {@link render}, which keeps what is already on
 * the page:
 *
 * ```ts
 * for await (const chunk of stream) {
 *   text += chunk;
 *   const partial = catalog.repair(parsePartialTree(text)).tree;
 *   if (partial) render(partial, main, catalog);
 * }
 * ```
 */
export function parsePartialTree(text: string): Tree | undefined {
  const start = text.indexOf("{");
  if (start === -1) return undefined;
  const value = new PartialJson(text, start).value();
  return value.done === false && value.value === undefined ? undefined : elementFrom(value.value);
}

/** Objects and arrays the text ended inside of. */
const open = new WeakSet<object>();

function elementFrom(value: unknown): Tree | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const node = value as Record<string, unknown>;
  if (typeof node.tag !== "string") return undefined;
  // A leaf appears once it is complete; a container once its children begin.
  // By then its attributes and slot are final, so it renders once and stays.
  const attrs = node.attrs;
  if (open.has(node) && !("children" in node)) return undefined;
  if (attrs !== undefined && open.has(attrs as object)) return undefined;
  const children = Array.isArray(node.children)
    ? node.children.flatMap((child) => elementFrom(child) ?? [])
    : [];
  return {
    tag: node.tag,
    attrs: (attrs as Tree["attrs"]) ?? {},
    ...(typeof node.slot === "string" ? { slot: node.slot } : {}),
    children,
  };
}

/**
 * JSON read as far as it goes. Unfinished strings, numbers and literals are
 * left out rather than guessed at; unfinished objects and arrays are kept with
 * what they have so far, and marked in {@link open}.
 */
class PartialJson {
  constructor(
    private readonly text: string,
    private at: number,
  ) {}

  value(): { value?: unknown; done: boolean } {
    this.space();
    const char = this.text[this.at];
    if (char === undefined) return { done: false };
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === '"') return this.string();
    const literal = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(
      this.text.slice(this.at),
    );
    if (!literal) return { done: false };
    this.at += literal[0].length;
    // `12` at the very end may be the start of `125`.
    if (this.at >= this.text.length) return { done: false };
    return { value: JSON.parse(literal[0]), done: true };
  }

  private object(): { value: Record<string, unknown>; done: boolean } {
    const out: Record<string, unknown> = {};
    this.at++;
    for (;;) {
      this.space();
      if (this.text[this.at] === "}") {
        this.at++;
        return { value: out, done: true };
      }
      const key = this.string();
      if (!key.done) break;
      this.space();
      if (this.text[this.at] !== ":") break;
      this.at++;
      const item = this.value();
      if (item.value !== undefined) out[key.value as string] = item.value;
      if (!item.done) break;
      this.space();
      if (this.text[this.at] === ",") this.at++;
    }
    open.add(out);
    return { value: out, done: false };
  }

  private array(): { value: unknown[]; done: boolean } {
    const out: unknown[] = [];
    this.at++;
    for (;;) {
      this.space();
      if (this.text[this.at] === "]") {
        this.at++;
        return { value: out, done: true };
      }
      const item = this.value();
      if (item.value !== undefined) out.push(item.value);
      if (!item.done) break;
      this.space();
      if (this.text[this.at] === ",") this.at++;
    }
    open.add(out);
    return { value: out, done: false };
  }

  private string(): { value?: string; done: boolean } {
    if (this.text[this.at] !== '"') return { done: false };
    for (let end = this.at + 1; end < this.text.length; end++) {
      if (this.text[end] === "\\") {
        end++;
        continue;
      }
      if (this.text[end] === '"') {
        const value = JSON.parse(this.text.slice(this.at, end + 1)) as string;
        this.at = end + 1;
        return { value, done: true };
      }
    }
    this.at = this.text.length;
    return { done: false };
  }

  private space() {
    while (/\s/.test(this.text[this.at] ?? "")) this.at++;
  }
}
