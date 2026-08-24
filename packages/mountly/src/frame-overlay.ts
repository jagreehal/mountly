/**
 * Host-side overlay breakout for framed widgets.
 *
 * An iframe clips portals and modals to its box. Web Fragments solves that with
 * reframing (JS in an iframe, DOM projected into the host). Mountly keeps the
 * real iframe for isolation and offers this narrow, opt-in contract instead:
 * the frame asks the host to open/close an overlay in the top document.
 *
 * Prefer named `slot`s the host maps to its own components. Raw `html` is
 * untrusted — it only inserts when the host supplies `sanitizeHtml`.
 */
import type { FrameChannel } from "./frame-channel.js";

export const OVERLAY_OPEN = "overlay:open" as const;
export const OVERLAY_CLOSE = "overlay:close" as const;
export const OVERLAY_CLOSED = "overlay:closed" as const;

export interface OverlayOpenPayload {
  /** Correlates open with a later close. */
  id: string;
  /**
   * Named host slot. The host maps this to a renderer it owns — prefer this
   * over raw HTML so the frame never injects markup into the shell.
   */
  slot?: string;
  /** Structured-clonable props for the host slot renderer. */
  props?: Record<string, unknown>;
  /**
   * Untrusted HTML. Only rendered when {@link BindFrameOverlayOptions.sanitizeHtml}
   * is provided; otherwise the open is refused.
   */
  html?: string;
}

export interface OverlayClosePayload {
  id: string;
}

/** Standard overlay events a framed widget and its host can share. */
export interface FrameOverlayEvents {
  [OVERLAY_OPEN]: OverlayOpenPayload;
  [OVERLAY_CLOSE]: OverlayClosePayload;
  [OVERLAY_CLOSED]: OverlayClosePayload;
}

/** Structural channel surface — works with any event map that includes overlays. */
export interface OverlayHostChannel {
  on(name: typeof OVERLAY_OPEN, listener: (payload: OverlayOpenPayload) => void): () => void;
  on(name: typeof OVERLAY_CLOSE, listener: (payload: OverlayClosePayload) => void): () => void;
  emit(name: typeof OVERLAY_CLOSED, payload: OverlayClosePayload): void;
}

export interface OverlayFrameChannel {
  emit(name: typeof OVERLAY_OPEN, payload: OverlayOpenPayload): void;
  emit(name: typeof OVERLAY_CLOSE, payload: OverlayClosePayload): void;
  on(name: typeof OVERLAY_CLOSED, listener: (payload: OverlayClosePayload) => void): () => void;
}

export interface BindFrameOverlayOptions {
  /**
   * Map a named slot to host-owned UI. Required when the frame sends `slot`.
   * Return a cleanup to run when that overlay closes or the frame unmounts.
   */
  renderSlot?: (args: {
    id: string;
    slot: string;
    props: Record<string, unknown>;
    container: HTMLElement;
  }) => void | (() => void);
  /**
   * Sanitize frame-supplied HTML before insert. Without this, `html` payloads
   * are refused — a frame you isolated is a frame whose markup you do not trust.
   */
  sanitizeHtml?: (html: string) => string;
  /** Overlay root. Defaults to `document.body`. */
  root?: HTMLElement;
  /** Class on the host overlay wrapper. Defaults to `mountly-frame-overlay`. */
  className?: string;
  /** Reported when an open is refused. Defaults to `console.warn`. */
  onRefuse?: (reason: string, payload: OverlayOpenPayload) => void;
}

export function isOverlayOpenPayload(value: unknown): value is OverlayOpenPayload {
  if (!value || typeof value !== "object") return false;
  const id = (value as OverlayOpenPayload).id;
  if (typeof id !== "string" || id.length === 0) return false;
  const slot = (value as OverlayOpenPayload).slot;
  const html = (value as OverlayOpenPayload).html;
  if (slot !== undefined && typeof slot !== "string") return false;
  if (html !== undefined && typeof html !== "string") return false;
  if (slot === undefined && html === undefined) return false;
  const props = (value as OverlayOpenPayload).props;
  if (
    props !== undefined &&
    (typeof props !== "object" || props === null || Array.isArray(props))
  ) {
    return false;
  }
  return true;
}

export function isOverlayClosePayload(value: unknown): value is OverlayClosePayload {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as OverlayClosePayload).id === "string" &&
    (value as OverlayClosePayload).id.length > 0
  );
}

/**
 * Listen for overlay requests from a frame and render them in the host document.
 * Returns a cleanup that closes every open overlay and unsubscribes.
 */
export function bindFrameOverlay(
  channel: OverlayHostChannel,
  options: BindFrameOverlayOptions = {},
): () => void {
  const root = options.root ?? document.body;
  const className = options.className ?? "mountly-frame-overlay";
  const refuse =
    options.onRefuse ??
    ((reason: string, payload: OverlayOpenPayload) =>
      console.warn(`[mountly] refused overlay "${payload.id}": ${reason}`));

  const open = new Map<string, { el: HTMLElement; cleanup?: () => void }>();

  function closeOne(id: string, notifyFrame: boolean): void {
    const entry = open.get(id);
    if (!entry) return;
    entry.cleanup?.();
    entry.el.remove();
    open.delete(id);
    if (notifyFrame) channel.emit(OVERLAY_CLOSED, { id });
  }

  const offOpen = channel.on(OVERLAY_OPEN, (payload) => {
    if (!isOverlayOpenPayload(payload)) {
      refuse("invalid payload", payload as OverlayOpenPayload);
      return;
    }
    closeOne(payload.id, false);

    const el = document.createElement("div");
    el.className = className;
    el.setAttribute("data-mountly-overlay-id", payload.id);
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");

    let cleanup: (() => void) | undefined;

    if (payload.slot !== undefined) {
      if (!options.renderSlot) {
        refuse(`slot "${payload.slot}" sent but no renderSlot handler`, payload);
        return;
      }
      root.append(el);
      cleanup =
        options.renderSlot({
          id: payload.id,
          slot: payload.slot,
          props: payload.props ?? {},
          container: el,
        }) ?? undefined;
    } else if (payload.html !== undefined) {
      if (!options.sanitizeHtml) {
        refuse("html payload requires sanitizeHtml", payload);
        return;
      }
      el.innerHTML = options.sanitizeHtml(payload.html);
      root.append(el);
    }

    open.set(payload.id, { el, cleanup });
  });

  const offClose = channel.on(OVERLAY_CLOSE, (payload) => {
    if (!isOverlayClosePayload(payload)) return;
    closeOne(payload.id, true);
  });

  return () => {
    offOpen();
    offClose();
    for (const id of [...open.keys()]) closeOne(id, false);
  };
}

/** Frame-side: ask the host to open an overlay in the top document. */
export function openHostOverlay(channel: OverlayFrameChannel, payload: OverlayOpenPayload): void {
  if (!isOverlayOpenPayload(payload)) {
    throw new Error(
      "[mountly] openHostOverlay: payload needs a non-empty id and either slot or html.",
    );
  }
  channel.emit(OVERLAY_OPEN, payload);
}

/** Frame-side: ask the host to close an overlay it previously opened. */
export function closeHostOverlay(channel: OverlayFrameChannel, id: string): void {
  if (!id) throw new Error("[mountly] closeHostOverlay: id is required.");
  channel.emit(OVERLAY_CLOSE, { id });
}

/** Use with {@link createFrameChannel} validators when the contract includes overlays. */
export const frameOverlayValidators = {
  [OVERLAY_OPEN]: isOverlayOpenPayload,
  [OVERLAY_CLOSE]: isOverlayClosePayload,
  [OVERLAY_CLOSED]: isOverlayClosePayload,
} as const;

/** Re-export for hosts that type the channel as {@link FrameChannel}{@link FrameOverlayEvents}. */
export type { FrameChannel };
