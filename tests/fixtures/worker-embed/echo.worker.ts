// Answers from the worker's own origin, proving it loaded from the provider.
self.onmessage = (event: MessageEvent) => {
  self.postMessage(`${event.data} pong ${new URL(import.meta.url).origin}`);
};
