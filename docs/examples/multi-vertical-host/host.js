// One call: fetch manifest → inject import map in the right order.
const { bootstrapMountly } = await import("/packages/mountly/dist/runtime.js");
const manifest = await bootstrapMountly("/docs/examples/multi-vertical-host/manifest.json", {
  define: false,
});

// Bare specifiers resolve now that bootstrap installed the import map.
const { createPlatformBus } = await import("mountly/contracts");
const { defineMountlyFeature, registerCustomElement } = await import("mountly/elements");

for (const vertical of manifest.verticals ?? []) {
  const specifier = vertical.alias ?? vertical.id;
  const moduleUrl =
    specifier.startsWith("/") ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("http://") ||
    specifier.startsWith("https://") ||
    specifier.endsWith(".js")
      ? vertical.url
      : specifier;

  if (vertical.featureExport) {
    registerCustomElement(vertical.id, async () => {
      const mod = await import(/* @vite-ignore */ moduleUrl);
      return mod[vertical.featureExport];
    });
  }
}

defineMountlyFeature({
  modules: Object.fromEntries(
    (manifest.verticals ?? [])
      .filter((vertical) => !vertical.featureExport)
      .map((vertical) => {
        const specifier = vertical.alias ?? vertical.id;
        const moduleUrl =
          specifier.startsWith("/") ||
          specifier.startsWith("./") ||
          specifier.startsWith("../") ||
          specifier.startsWith("http://") ||
          specifier.startsWith("https://") ||
          specifier.endsWith(".js")
            ? vertical.url
            : specifier;
        return [vertical.id, { moduleUrl }];
      }),
  ),
});

const bus = createPlatformBus();
const logEl = document.getElementById("bus-log");
const lines = [];

function log(message) {
  lines.unshift(message);
  if (lines.length > 8) lines.pop();
  if (logEl) logEl.textContent = lines.join("\n");
}

bus.on("payment:selected", (payload) => {
  log(
    `[media team heard] payment:selected → ${payload.paymentId} (${payload.amount} ${payload.currency})`,
  );
});

bus.on("cart:updated", (payload) => {
  log(
    `[payments team heard] cart:updated → ${payload.itemCount} items, ${payload.total} ${payload.currency}`,
  );
});

document.getElementById("emit-payment")?.addEventListener("click", () => {
  bus.emit("payment:selected", {
    paymentId: "pay_demo",
    amount: 149.99,
    currency: "USD",
  });
  log("[payments team emitted] payment:selected");
});

document.getElementById("emit-cart")?.addEventListener("click", () => {
  bus.emit("cart:updated", {
    itemCount: 3,
    total: 89.5,
    currency: "USD",
  });
  log("[media team emitted] cart:updated");
});
