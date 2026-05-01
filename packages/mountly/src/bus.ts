export type EventMap = Record<string, unknown>;
export type EventValidator<T> = (payload: unknown) => payload is T;

export interface EventBusOptions<Events extends EventMap> {
  namespace?: string;
  validators?: Partial<{ [K in keyof Events]: EventValidator<Events[K]> }>;
  target?: EventTarget;
}

export interface EventBus<Events extends EventMap> {
  emit: <K extends keyof Events & string>(name: K, payload: Events[K]) => void;
  on: <K extends keyof Events & string>(
    name: K,
    listener: (payload: Events[K], event: CustomEvent<Events[K]>) => void,
  ) => () => void;
  off: <K extends keyof Events & string>(
    name: K,
    listener: (payload: Events[K], event: CustomEvent<Events[K]>) => void,
  ) => void;
  eventName: <K extends keyof Events & string>(name: K) => string;
}

const fallbackTarget = new EventTarget();

export function createEventBus<Events extends EventMap = EventMap>(
  options: EventBusOptions<Events> = {},
): EventBus<Events> {
  const target = options.target ?? fallbackTarget;
  const namespace = options.namespace;
  const wrappers = new Map<Function, Map<string, EventListener>>();
  const eventName = <K extends keyof Events & string>(name: K): string =>
    namespace ? `${namespace}:${name}` : name;

  return {
    eventName,
    emit(name, payload) {
      const validate = options.validators?.[name];
      if (validate && !validate(payload)) {
        throw new Error(`[mountly] invalid payload for event "${eventName(name)}".`);
      }
      target.dispatchEvent(new CustomEvent(eventName(name), { detail: payload }));
    },
    on(name, listener) {
      const wrapped: EventListener = (event) => {
        listener(
          (event as CustomEvent<Events[typeof name]>).detail,
          event as CustomEvent<Events[typeof name]>,
        );
      };
      const fullName = eventName(name);
      const listenerWrappers = wrappers.get(listener) ?? new Map<string, EventListener>();
      listenerWrappers.set(fullName, wrapped);
      wrappers.set(listener, listenerWrappers);
      target.addEventListener(fullName, wrapped);
      return () => {
        target.removeEventListener(fullName, wrapped);
        listenerWrappers.delete(fullName);
        if (listenerWrappers.size === 0) wrappers.delete(listener);
      };
    },
    off(name, listener) {
      const fullName = eventName(name);
      const listenerWrappers = wrappers.get(listener);
      const wrapped = listenerWrappers?.get(fullName);
      if (!wrapped) return;
      target.removeEventListener(fullName, wrapped);
      listenerWrappers?.delete(fullName);
      if (listenerWrappers?.size === 0) wrappers.delete(listener);
    },
  };
}
