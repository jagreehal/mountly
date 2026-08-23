/**
 * Typed, versioned events across an iframe boundary.
 *
 * A framed widget is isolated by the browser: its own `window`, its own styles,
 * its own globals. That is the point — but it also means the widget cannot
 * reach the host, and the host cannot reach it, except through `postMessage`.
 * Handing application code raw `postMessage` gives up type safety and leaves
 * every widget to reimplement the protocol; this module is the narrow,
 * explicit channel instead.
 *
 * Deliberately NOT a bridge over {@link createEventBus}. A same-context bus
 * carries everything the host emits — auth state, user context, whatever else
 * happens to share the namespace — and silently forwarding all of it into a
 * frame you framed *because you do not trust it* would undo the isolation the
 * iframe was chosen for. What crosses the boundary is listed at the call site.
 *
 * The transport is supplied by the caller (`send`), so the same code runs on
 * both sides: `mountly/iframe` on the host, `mountly/iframe/child` in the frame.
 */
import type { EventValidator } from "./bus.js";

/**
 * Event map for a channel. Deliberately `object` rather than
 * `Record<string, unknown>`: an `interface` has no implicit index signature, so
 * the stricter constraint would reject the most natural way to declare a
 * contract.
 */
export type FrameEventMap = object;

/**
 * Current contract version. Bump when the envelope shape itself changes, not
 * when an application adds an event — {@link FrameChannelOptions.version} is
 * the knob for that.
 */
export const FRAME_CONTRACT_VERSION = 1;

/** Marker that separates channel traffic from the host's prop messages. */
const ENVELOPE_KEY = "__mountlyFrame";

interface FrameEnvelope {
  [ENVELOPE_KEY]: number;
  name: string;
  payload: unknown;
}

function isEnvelope(message: unknown): message is FrameEnvelope {
  return (
    typeof message === "object" &&
    message !== null &&
    typeof (message as FrameEnvelope)[ENVELOPE_KEY] === "number" &&
    typeof (message as FrameEnvelope).name === "string"
  );
}

export interface FrameChannel<Events extends FrameEventMap> {
  /** Send an event to the other side. Throws if a validator rejects the payload. */
  emit: <K extends keyof Events & string>(name: K, payload: Events[K]) => void;
  /** Listen for an event from the other side. Returns an unsubscribe function. */
  on: <K extends keyof Events & string>(
    name: K,
    listener: (payload: Events[K]) => void,
  ) => () => void;
}

export interface FrameChannelOptions<Events extends FrameEventMap> {
  /**
   * Contract version this side speaks. Defaults to
   * {@link FRAME_CONTRACT_VERSION}.
   *
   * Incoming events stamped **newer** than this are dropped rather than
   * delivered: an older host stays up when a newly deployed widget starts
   * emitting events it has never heard of. Older events are delivered, since a
   * newer peer is expected to still understand what it used to send.
   */
  version?: number;
  /**
   * Per-event payload guards. Applied on both send and receive — the sender
   * catches its own mistakes early, and the receiver never trusts the frame.
   */
  validators?: Partial<{ [K in keyof Events]: EventValidator<Events[K]> }>;
  /** Reported when a message is dropped. Defaults to `console.warn`. */
  onDrop?: (reason: string) => void;
}

export interface FrameChannelBinding<Events extends FrameEventMap> {
  channel: FrameChannel<Events>;
  /**
   * Feed a raw `postMessage` payload in. Returns `true` if it was channel
   * traffic (delivered or deliberately dropped), so the caller can tell channel
   * messages apart from the host's props.
   */
  receive: (message: unknown) => boolean;
}

/**
 * Build a channel over a caller-supplied transport.
 *
 * `send` is expected to already be origin-pinned; inbound authenticity is the
 * transport's job too (`resize-iframe` matches `event.source` against the exact
 * `contentWindow`, which the browser sets and a page cannot forge).
 */
export function createFrameChannel<Events extends FrameEventMap = FrameEventMap>(
  send: (envelope: unknown) => void,
  options: FrameChannelOptions<Events> = {},
): FrameChannelBinding<Events> {
  const version = options.version ?? FRAME_CONTRACT_VERSION;
  const drop = options.onDrop ?? ((reason: string) => console.warn(`[mountly] ${reason}`));
  const listeners = new Map<string, Set<(payload: never) => void>>();

  return {
    channel: {
      emit(name, payload) {
        const validate = options.validators?.[name];
        if (validate && !validate(payload)) {
          throw new Error(`[mountly] invalid payload for frame event "${name}".`);
        }
        send({ [ENVELOPE_KEY]: version, name, payload } satisfies FrameEnvelope);
      },
      on(name, listener) {
        let set = listeners.get(name);
        if (!set) listeners.set(name, (set = new Set()));
        set.add(listener as (payload: never) => void);
        return () => {
          set.delete(listener as (payload: never) => void);
          if (set.size === 0) listeners.delete(name);
        };
      },
    },

    receive(message) {
      if (!isEnvelope(message)) return false;

      if (message[ENVELOPE_KEY] > version) {
        drop(
          `dropped frame event "${message.name}": peer speaks contract v${message[ENVELOPE_KEY]}, ` +
            `this side speaks v${version}.`,
        );
        return true;
      }

      const validate = options.validators?.[message.name as keyof Events];
      if (validate && !validate(message.payload)) {
        drop(`dropped frame event "${message.name}": payload failed validation.`);
        return true;
      }

      // Copied: a listener that unsubscribes mid-dispatch must not reindex the
      // set the loop is walking.
      for (const listener of [...(listeners.get(message.name) ?? [])]) {
        (listener as (payload: unknown) => void)(message.payload);
      }
      return true;
    },
  };
}
