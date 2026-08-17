// Mock Product A API before bootstrap loads the widget.
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("/api/product-a/settings")) {
    const tenantId = new URL(url, location.origin).searchParams.get("tenantId") ?? "demo";
    return new Response(
      JSON.stringify({
        tenantId,
        plan: "Business",
        seats: 42,
        apiBase: "https://api.product-a.example/v1",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  return originalFetch(input, init);
};

const { bootstrapMountly } = await import("/packages/mountly/dist/runtime.js");
const manifest = await bootstrapMountly(
  "/docs/examples/platform-embed/platform-host/manifest.json",
  {
    define: false,
  },
);

const { defineMountlyFeature, registerCustomElement } = await import("mountly/elements");

for (const vertical of manifest.verticals ?? []) {
  if (!vertical.featureExport) continue;
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

  registerCustomElement(vertical.id, async () => {
    const mod = await import(/* @vite-ignore */ moduleUrl);
    return mod[vertical.featureExport];
  });
}

defineMountlyFeature({ scan: true });
