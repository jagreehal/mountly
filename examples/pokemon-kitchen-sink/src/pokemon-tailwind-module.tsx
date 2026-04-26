import React from "react";
import { createRoot, type Root } from "react-dom/client";
import "./pokemon-tailwind.css";

type PokemonDetails = {
  name: string;
  height: number;
  weight: number;
  sprites?: { front_default?: string | null };
  types: Array<{ type: { name: string } }>;
};

const roots = new WeakMap<HTMLElement, Root>();

function TailwindStylePokemon({ data }: { data: PokemonDetails }) {
  return (
    <div className="pk-shell">
      <div className="pk-row">
        {data.sprites?.front_default ? (
          <img className="pk-avatar" src={data.sprites.front_default} alt={data.name} />
        ) : null}
        <div>
          <h4 className="pk-title">{data.name}</h4>
          <p className="pk-sub">H: {data.height} / W: {data.weight}</p>
        </div>
      </div>
      <div className="pk-chip-row">
        {data.types.map((typeEntry) => (
          <span className="pk-chip" key={typeEntry.type.name}>
            {typeEntry.type.name}
          </span>
        ))}
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
    ensureRoot(container).render(<TailwindStylePokemon data={data} />);
  },
  update(container: HTMLElement, props: Record<string, unknown>) {
    const data = props.data as PokemonDetails;
    ensureRoot(container).render(<TailwindStylePokemon data={data} />);
  },
  unmount(container: HTMLElement) {
    roots.get(container)?.unmount();
    roots.delete(container);
  },
};
