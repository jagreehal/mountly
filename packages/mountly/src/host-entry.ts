import { bootstrapMountlyHostFromScriptTag } from "./host.js";

export { bootstrapMountlyHost, bootstrapMountlyHostFromScriptTag } from "./host.js";

const current = document.currentScript as HTMLScriptElement | null;
const hostScript =
  (current?.hasAttribute("data-mountly-host") ? current : null) ??
  (document.querySelector("script[data-mountly-host]") as HTMLScriptElement | null);

if (hostScript) {
  bootstrapMountlyHostFromScriptTag(hostScript);
}
