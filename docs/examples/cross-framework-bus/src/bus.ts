import { createEventBus } from "mountly/bus";

export type CounterEvent = { source: "react" | "vue" | "svelte"; value: number };

const bus = createEventBus<{ "counter:changed": CounterEvent }>();

export function emitCounterChanged(event: CounterEvent): void {
  bus.emit("counter:changed", event);
}

export function onCounterChanged(handler: (event: CounterEvent) => void): () => void {
  return bus.on("counter:changed", handler);
}
