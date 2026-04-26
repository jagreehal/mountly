import { createWidget } from "mountly-react";
import { SignupCard } from "./Component.js";
import styles from "./styles.generated.css";

/*
 * Wraps mountly-react's createWidget with:
 *   - focus restoration on unmount (a11y)
 *   - skeleton children clearing on first mount (CLS prevention)
 *   - update() that re-renders without an unmount/remount cycle
 *
 * The adapter's mount() is idempotent so update() can simply call it
 * with new props.
 *
 * Note: adoptedStyleSheets optimization is dropped relative to the previous
 * hand-written mount.ts. createWidget uses inline <style> injection only.
 * This is an acceptable trade-off for an example package.
 */

const widget = createWidget(SignupCard, { styles });

interface State {
  previousFocus: HTMLElement | null;
  hasMounted: boolean;
}

const states = new WeakMap<HTMLElement, State>();

export function mountSignupCard(
  container: HTMLElement,
  props: Record<string, unknown>
): void {
  let state = states.get(container);
  if (!state) {
    state = {
      previousFocus:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
      hasMounted: false,
    };
    states.set(container, state);
  }

  // First mount: clear any host-rendered skeleton from light DOM.
  if (!state.hasMounted) {
    container.replaceChildren();
    state.hasMounted = true;
  }

  widget.mount(container, props);
}

export function updateSignupCard(
  container: HTMLElement,
  props: Record<string, unknown>
): void {
  // Adapter mount is idempotent — re-rendering with new props is just a re-mount.
  widget.mount(container, props);
}

export function unmountSignupCard(container: HTMLElement): void {
  const state = states.get(container);
  widget.unmount(container);
  states.delete(container);

  if (state?.previousFocus && document.contains(state.previousFocus)) {
    try {
      state.previousFocus.focus();
    } catch {
      // Ignore: element may have become non-focusable.
    }
  }
}
