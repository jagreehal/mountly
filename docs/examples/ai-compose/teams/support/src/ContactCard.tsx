interface Props {
  /** Topic the customer needs help with, shown as the heading. */
  topic?: string;
  /** Fired when the user asks for a callback. */
  onCallback?: () => void;
}

/** Ways to reach a human: chat hours, phone, and a callback button. Use when the customer is stuck or asks for a person. */
export default function ContactCard({ topic = "Need a hand?", onCallback }: Props) {
  return (
    <section className="w-card">
      <h3>{topic}</h3>
      <p className="w-muted">Chat 8am–8pm · 0800 000 000</p>
      <button type="button" onClick={() => onCallback?.()}>
        Request a callback
      </button>
    </section>
  );
}
