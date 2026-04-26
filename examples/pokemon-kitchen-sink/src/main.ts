import {
  createOnDemandFeature,
  defineMountlyFeature,
  registerCustomElement,
  onAnalyticsEvent,
  createDevtoolsPanel,
} from "mountly";

type PokemonListItem = { name: string; url: string };
type PokemonDetails = {
  name: string;
  height: number;
  weight: number;
  sprites?: { front_default?: string | null };
  types: Array<{ type: { name: string } }>;
};

const stateEl = document.getElementById("state")!;
const analyticsEl = document.getElementById("analytics-log")!;
const gridEl = document.getElementById("pokemon-grid")!;

const pokemonFeature = createOnDemandFeature({
  moduleId: "pokemon-detail",
  loadModule: async () => (await import("./pokemon-detail-module")).default,
  loadData: async (ctx) => {
    const name = String(ctx.pokemonName ?? "");
    const dataUrl = typeof ctx.dataUrl === "string" ? ctx.dataUrl : "";
    const url = dataUrl || `https://pokeapi.co/api/v2/pokemon/${name}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch pokemon details: ${response.status}`);
    return (await response.json()) as PokemonDetails;
  },
  getCacheKey: (ctx) => `pokemon:${String(ctx.pokemonName ?? ctx.dataUrl ?? "")}`,
  render: ({ mod, data, container }) => {
    mod.mount(container, { data });
  },
});

const customElementPokemonFeature = createOnDemandFeature({
  moduleId: "pokemon-detail-ce",
  loadModule: async () => (await import("./pokemon-detail-module")).default,
  loadData: async (ctx) => {
    const url = String(ctx.dataUrl ?? "");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed custom-element fetch: ${response.status}`);
    return (await response.json()) as PokemonDetails;
  },
  render: ({ mod, data, container }) => {
    mod.mount(container, { data });
  },
});

const customElementTailwindPokemonFeature = createOnDemandFeature({
  moduleId: "pokemon-tailwind-ce",
  loadModule: async () => (await import("./pokemon-tailwind-module")).default,
  loadData: async (ctx) => {
    const url = String(ctx.dataUrl ?? "");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed tailwind custom-element fetch: ${response.status}`);
    return (await response.json()) as PokemonDetails;
  },
  render: ({ mod, data, container }) => {
    mod.mount(container, { data });
  },
});

registerCustomElement("pokemon-detail-ce", () => customElementPokemonFeature);
registerCustomElement("pokemon-tailwind-ce", () => customElementTailwindPokemonFeature);
defineMountlyFeature();
createDevtoolsPanel({ position: "bottom-right", collapsed: true });

onAnalyticsEvent((event) => {
  stateEl.textContent = `state: ${pokemonFeature.getState()}`;
  const line = `${new Date(event.timestamp).toLocaleTimeString()} ${event.moduleId} ${event.phase} ${event.duration ? `${event.duration.toFixed(0)}ms` : ""}`;
  analyticsEl.textContent = `${line}\n${analyticsEl.textContent}`.slice(0, 4000);
});

async function fetchList(): Promise<PokemonListItem[]> {
  const response = await fetch("https://pokeapi.co/api/v2/pokemon?limit=18&offset=0");
  if (!response.ok) throw new Error(`Failed list fetch: ${response.status}`);
  const data = (await response.json()) as { results: PokemonListItem[] };
  return data.results;
}

function createPokemonCard(item: PokemonListItem) {
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <h3>${item.name}</h3>
    <p class="muted mono">hover preload + click toggle mount</p>
    <button>Inspect ${item.name}</button>
    <div class="mount"></div>
  `;

  const trigger = card.querySelector("button") as HTMLButtonElement;
  const mount = card.querySelector(".mount") as HTMLDivElement;

  pokemonFeature.attach({
    trigger,
    mount,
    preloadOn: "hover",
    activateOn: "click",
    context: { pokemonName: item.name },
    toggle: true,
    onError: (err) => {
      mount.textContent = String(err);
    },
  });

  return card;
}

document.getElementById("load-list")!.addEventListener("click", async () => {
  gridEl.innerHTML = "<p>Loading...</p>";
  try {
    const list = await fetchList();
    gridEl.innerHTML = "";
    for (const item of list) gridEl.appendChild(createPokemonCard(item));
  } catch (error) {
    gridEl.textContent = String(error);
  }
});

document.getElementById("immediate-render")!.addEventListener("click", async () => {
  const existing = gridEl.querySelector(".card .mount") as HTMLDivElement | null;
  if (!existing) return;
  await pokemonFeature.mount(existing, { pokemonName: "bulbasaur", triggerType: "programmatic" });
});

document.getElementById("clear-mounts")!.addEventListener("click", () => {
  for (const mount of pokemonFeature.getMounts()) {
    const unmount = (mount as HTMLElement & { _unmount?: () => void })._unmount;
    unmount?.();
  }
});

const viewportTrigger = document.getElementById("viewport-trigger")!;
const viewportMount = document.getElementById("viewport-mount")!;
const viewportActivate = document.getElementById("viewport-activate")!;
pokemonFeature.attach({
  trigger: viewportTrigger,
  mount: viewportMount,
  preloadOn: "viewport",
  activateOn: "click",
  context: { pokemonName: "pikachu" },
});
viewportActivate.addEventListener("click", () => {
  viewportTrigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
