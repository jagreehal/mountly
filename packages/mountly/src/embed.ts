/**
 * Script-tag element distributions.
 *
 * A build emits one small file that registers every tag up front and downloads
 * nothing. The component, its framework and its CSS arrive when an element
 * actually connects. The prop table comes from the component's own TypeScript
 * types, so a consumer writes ordinary attributes, sets ordinary properties and
 * listens for ordinary DOM events — no JSON blob, no init call, no import map.
 */
import type { WidgetModule } from "./adapter.js";
import { mount, update, wire } from "./core.js";

/** How an attribute string becomes a prop value. Emitted by the build. */
export type PropKind = "string" | "number" | "boolean" | "json" | "auto" | "event";

export interface PropSpec {
  /** Prop name the component reads. */
  name: string;
  /** Attribute the consumer writes. Absent for callback props. */
  attribute?: string;
  kind: PropKind;
  /** DOM event dispatched when the component calls this prop. */
  event?: string;
}

export interface ElementDefinition {
  load: () => Promise<WidgetModule | { default: WidgetModule }>;
  /** Derived from the component's props type at build time. */
  props?: PropSpec[];
  /** Core trigger syntax. Defaults to mounting when connected. */
  trigger?: string;
}

export type MountlyElement<Props = Record<string, unknown>> = HTMLElement &
  Partial<Props> & {
    /** Retry a failed load, or mount before the configured trigger. */
    mount(): Promise<void>;
  };

/**
 * An untyped prop guesses from the literal. The round-trip check keeps "1.0"
 * and "007" as strings; type the component's props to remove the guess.
 */
function auto(raw: string): unknown {
  try {
    const value: unknown = JSON.parse(raw);
    if (value !== null && typeof value === "object") return value;
    return JSON.stringify(value) === raw ? value : raw;
  } catch {
    return raw;
  }
}

function coerce(kind: PropKind, raw: string | null): unknown {
  // Boolean props follow HTML: present is true, absent is false.
  if (kind === "boolean") return raw !== null && raw !== "false";
  if (raw === null) return undefined;
  if (kind === "string") return raw;
  if (kind === "number") return raw === "" ? undefined : Number(raw);
  if (kind === "json") return JSON.parse(raw);
  return auto(raw);
}

/** Register the tags without downloading any of their components. */
export function defineElements(definitions: Record<string, ElementDefinition>): void {
  if (typeof customElements === "undefined") return;
  for (const [tag, definition] of Object.entries(definitions)) defineElement(tag, definition);
}

// Each class keeps its own scope, including when private fields are downleveled.
function defineElement(tag: string, definition: ElementDefinition): void {
  if (customElements.get(tag)) {
    throw new Error(`[mountly] <${tag}> is already defined; use one version or a different tag`);
  }

  const specs = definition.props ?? [];
  const dataProps = specs.filter((spec) => spec.kind !== "event");
  const eventProps = specs.filter((spec) => spec.kind === "event");
  const byAttribute = new Map(dataProps.map((spec) => [spec.attribute ?? spec.name, spec]));
  const trigger = definition.trigger ?? "connected";
  // Mountly's own control surface lives under `data-mountly-*` so it can never
  // collide with a component prop. `trigger` in particular is a prop name real
  // components use.
  const TRIGGER_ATTRIBUTE = "data-mountly-trigger";
  // Core caches this loader once per tag; prop values stay on each element.
  const options = {
    load: async () => {
      const loaded = await definition.load();
      const widget = ("default" in loaded ? loaded.default : loaded) as WidgetModule;
      if (typeof widget?.mount !== "function") {
        throw new TypeError(`[mountly] <${tag}> loader must return a widget`);
      }
      return widget;
    },
  };

  class MountlyEmbedElement extends HTMLElement {
    static observedAttributes = [...byAttribute.keys(), TRIGGER_ATTRIBUTE];
    // One real accessor per prop, so `el.balance = 1250` is reactive and typed
    // rather than an expando the element never notices.
    static {
      for (const spec of dataProps) {
        // A prop named `id`, `title` or `style` must not shadow the platform's
        // own accessor — that would quietly break getElementById and friends.
        // The attribute still feeds the component; only the property is left
        // to the DOM.
        // `mount` is this element's own control method; shadowing it with a
        // data accessor would make the element impossible to mount.
        if (spec.name in HTMLElement.prototype || spec.name === "mount") {
          console.warn(
            `[mountly] <${tag}> prop "${spec.name}" collides with an element property; ` +
              `set it with the ${JSON.stringify(spec.attribute ?? spec.name)} attribute instead`,
          );
          continue;
        }
        Object.defineProperty(this.prototype, spec.name, {
          configurable: true,
          enumerable: true,
          get(this: MountlyEmbedElement) {
            return this.#values[spec.name];
          },
          set(this: MountlyEmbedElement, value: unknown) {
            this.#set(spec.name, value);
          },
        });
      }
    }
    #values: Record<string, unknown> = Object.fromEntries(
      dataProps.map((spec) => [spec.name, coerce(spec.kind, null)]),
    );
    #callbacks = Object.fromEntries(
      eventProps.map((spec) => [
        spec.name,
        (detail: unknown) =>
          this.dispatchEvent(
            new CustomEvent(spec.event ?? spec.name, { detail, bubbles: true, composed: true }),
          ),
      ]),
    );
    /** Attributes whose value could not be parsed, by prop name. */
    #errors = new Map<string, unknown>();
    #stop?: () => void;
    #slot?: HTMLDivElement;
    #fallback = document.createDocumentFragment();
    #queued = false;

    constructor() {
      super();
      this.addEventListener("mountly:mount", (event) => {
        if (event.target !== this) return;
        for (const child of Array.from(this.childNodes)) {
          if (child !== this.#slot) this.#fallback.append(child);
        }
        if (this.#slot) this.#slot.hidden = false;
      });
    }

    connectedCallback() {
      // A host can assign properties before the deferred script registers us.
      // Re-running them through the accessor is the standard upgrade dance, and
      // it lands after attributes so an explicit property always wins.
      for (const spec of dataProps) {
        if (!Object.prototype.hasOwnProperty.call(this, spec.name)) continue;
        const value = (this as Record<string, unknown>)[spec.name];
        delete (this as Record<string, unknown>)[spec.name];
        (this as Record<string, unknown>)[spec.name] = value;
      }
      this.#schedule();
    }

    disconnectedCallback() {
      this.#stop?.();
      this.#stop = undefined;
      this.#slot?.remove();
      this.#slot = undefined;
      this.append(this.#fallback);
    }

    attributeChangedCallback(name: string, oldValue: string | null, value: string | null) {
      if (oldValue === value) return;
      if (name === TRIGGER_ATTRIBUTE) {
        if (this.#stop) this.disconnectedCallback();
        this.#schedule();
        return;
      }
      const spec = byAttribute.get(name);
      if (!spec) return;
      try {
        this.#set(spec.name, coerce(spec.kind, value));
      } catch (error) {
        this.#fail(spec.name, error);
      }
    }

    async mount(): Promise<void> {
      if (!this.isConnected || this.#errors.size) return;
      this.#start();
      await mount(this, options);
    }

    #set(name: string, value: unknown) {
      this.#values[name] = value;
      const wasFailed = this.#errors.size > 0;
      // Giving a prop a good value clears that prop's error, however it
      // arrives — a corrected attribute or an assigned property.
      this.#errors.delete(name);
      // Another prop is still broken, so the element stays in error.
      if (this.#errors.size) return;
      // Reset only when this actually cleared an error. A mounted element
      // taking an ordinary update stays mounted.
      if (wasFailed) this.dataset.mountlyState = "idle";
      if (this.#stop) update(this, this.#props());
      else this.#schedule();
    }

    #props(): Record<string, unknown> {
      return { ...this.#values, ...this.#callbacks };
    }

    #trigger(): string {
      return this.getAttribute(TRIGGER_ATTRIBUTE) ?? trigger;
    }

    #schedule() {
      if (this.#queued) return;
      this.#queued = true;
      // Coalesce the burst of attribute and property writes that lands while
      // the parser or the host is still setting an element up.
      queueMicrotask(() => {
        this.#queued = false;
        if (!this.isConnected || this.#errors.size) return;
        this.#start();
        if (this.#trigger() === "connected") void this.mount();
      });
    }

    #start() {
      if (this.#stop) return;
      this.#slot = document.createElement("div");
      this.#slot.hidden = true;
      this.#slot.setAttribute("data-mountly-embed-root", "");
      this.append(this.#slot);
      this.dataset.mountly = `mountly:element:${tag}`;
      // `data-mountly` is a cache key here, not a URL. The build ships this
      // element's code and CSS through its own chunk graph, so the core must
      // neither look for a sibling stylesheet nor leak asset hints into props.
      this.dataset.css = "none";
      this.dataset.moduleUrl = "";
      this.dataset.target = ":scope > [data-mountly-embed-root]";
      const spec = this.#trigger();
      this.dataset.on = spec === "connected" ? "never" : spec;
      this.#stop = wire(this, options);
      update(this, this.#props());
    }

    #fail(prop: string, error: unknown) {
      this.#errors.set(prop, error);
      this.#stop?.();
      this.#stop = undefined;
      this.#slot?.remove();
      this.#slot = undefined;
      this.append(this.#fallback);
      this.dataset.mountlyState = "error";
      this.dispatchEvent(
        new CustomEvent("mountly:error", { detail: { error, prop }, bubbles: true }),
      );
      console.error(`[mountly] <${tag}> ${prop}: invalid attribute`, error);
    }
  }

  customElements.define(tag, MountlyEmbedElement);
}
