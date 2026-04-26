import React from "react";
import { createRoot, type Root } from "react-dom/client";

type PokemonDetails = {
  name: string;
  height: number;
  weight: number;
  sprites?: { front_default?: string | null };
  types: Array<{ type: { name: string } }>;
};

const roots = new WeakMap<HTMLElement, Root>();

function PokemonDetail({ data }: { data: PokemonDetails }) {
  return (
    <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {data.sprites?.front_default ? (
          <img src={data.sprites.front_default} alt={data.name} width={72} height={72} />
        ) : null}
        <div>
          <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{data.name}</div>
          <div>Height: {data.height}</div>
          <div>Weight: {data.weight}</div>
          <div>Types: {data.types.map((t) => t.type.name).join(", ")}</div>
        </div>
      </div>
    </div>
  );
}

function ensureRoot(container: HTMLElement): Root {
  const existing = roots.get(container);
  if (existing) return existing;
  const next = createRoot(container);
  roots.set(container, next);
  return next;
}

export default {
  mount(container: HTMLElement, props: Record<string, unknown>) {
    const data = props.data as PokemonDetails;
    ensureRoot(container).render(<PokemonDetail data={data} />);
  },
  update(container: HTMLElement, props: Record<string, unknown>) {
    const data = props.data as PokemonDetails;
    ensureRoot(container).render(<PokemonDetail data={data} />);
  },
  unmount(container: HTMLElement) {
    roots.get(container)?.unmount();
    roots.delete(container);
  },
};
