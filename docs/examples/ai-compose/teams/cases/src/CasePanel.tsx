import "./panel.css";

interface Props {
  /** The issue in a few words, e.g. "Charged twice for INV-0998". */
  heading: string;
}

/**
 * A titled panel that groups the widgets explaining one customer problem. Use when two or more widgets answer the same problem together, such as a disputed charge; put those widgets inside it.
 * @slot - The widgets that explain the case.
 * @slot actions - What the user can do next.
 */
export default function CasePanel({ heading }: Props) {
  return (
    <section className="panel">
      <h2>{heading}</h2>
      <div className="body">
        <slot />
      </div>
      <footer>
        <slot name="actions" />
      </footer>
    </section>
  );
}
