import { createWidget } from "mountly-svelte";
import SvelteCounter from "./SvelteCounter.svelte";

export default createWidget(SvelteCounter, { shadow: false });
