export type CounterEvent = { source: "react" | "vue" | "svelte"; value: number };

const bus = new EventTarget();
const CHANNEL = "counter:changed";

export function emitCounterChanged(event: CounterEvent): void {
  bus.dispatchEvent(new CustomEvent<CounterEvent>(CHANNEL, { detail: event }));
}

export function onCounterChanged(handler: (event: CounterEvent) => void): () => void {
  const wrapped = (event: Event) => {
    handler((event as CustomEvent<CounterEvent>).detail);
  };
  bus.addEventListener(CHANNEL, wrapped);
  return () => bus.removeEventListener(CHANNEL, wrapped);
}
