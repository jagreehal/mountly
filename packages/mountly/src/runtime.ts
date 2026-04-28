const RUNTIME_MARK = "data-mountly-runtime";
let installed = false;

export interface RuntimeUrls {
  react: string;
  reactDom: string;
  reactDomClient: string;
  reactJsxRuntime?: string;
}

function deriveReactJsxRuntimeUrl(reactUrl: string): string {
  try {
    const url = new URL(reactUrl);
    if (url.pathname.endsWith("/jsx-runtime")) return url.toString();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/jsx-runtime`;
    return url.toString();
  } catch {
    if (reactUrl.endsWith("/jsx-runtime")) return reactUrl;
    return `${reactUrl.replace(/\/+$/, "")}/jsx-runtime`;
  }
}

export function installRuntime(urls: RuntimeUrls): void {
  if (typeof document === "undefined") {
    throw new Error("[mountly] installRuntime() requires a browser document.");
  }
  const firstModuleScript = document.querySelector("script[type=module]");
  if (
    firstModuleScript &&
    firstModuleScript.compareDocumentPosition(document.head) === Node.DOCUMENT_POSITION_PRECEDING
  ) {
    console.warn(
      "[mountly] installRuntime detected module scripts before runtime import map; bare-specifier imports may fail.",
    );
  }
  const reactJsxRuntime = urls.reactJsxRuntime ?? deriveReactJsxRuntimeUrl(urls.react);
  const desired = {
    react: urls.react,
    "react/jsx-runtime": reactJsxRuntime,
    "react-dom": urls.reactDom,
    "react-dom/client": urls.reactDomClient,
  };

  if (installed) {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[${RUNTIME_MARK}]`,
    );
    const prev = existing ? JSON.parse(existing.textContent ?? "{}") : null;
    const mismatch =
      prev?.imports?.react !== desired.react ||
      prev?.imports?.["react/jsx-runtime"] !== desired["react/jsx-runtime"] ||
      prev?.imports?.["react-dom"] !== desired["react-dom"] ||
      prev?.imports?.["react-dom/client"] !== desired["react-dom/client"];
    if (mismatch) {
      console.warn(
        "[mountly] installRuntime called twice with different URLs; first call wins.",
      );
    }
    return;
  }

  if (
    document.readyState !== "loading" &&
    document.querySelector("script[type=module]")
  ) {
    console.warn(
      "[mountly] installRuntime called after module loading may have started. " +
        "Call it from an inline <script> in <head>, before any module imports.",
    );
  }
  const preExistingImportMap = document.querySelector("script[type=importmap]:not([data-mountly-runtime])");
  if (preExistingImportMap) {
    console.warn(
      "[mountly] existing import map detected; ensure runtime imports are defined before widget module imports.",
    );
  }

  const script = document.createElement("script");
  script.type = "importmap";
  script.setAttribute(RUNTIME_MARK, "");
  script.textContent = JSON.stringify({ imports: desired });
  document.head.prepend(script);
  installed = true;
}
