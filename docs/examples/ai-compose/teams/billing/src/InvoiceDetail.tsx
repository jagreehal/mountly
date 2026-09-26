import { invoices, payments } from "./data";

interface Props {
  /** Invoice id, e.g. `INV-0998`. */
  invoiceId: string;
  /** Fired when the user disputes a charge. Detail: `{ invoiceId }`. */
  onDispute?: (detail: { invoiceId: string }) => void;
}

/** One invoice in full: amount, status and every card payment taken for it. Needs an invoice id the user has already picked; never use it to find an invoice. */
export default function InvoiceDetail({ invoiceId, onDispute }: Props) {
  const invoice = Object.values(invoices)
    .flat()
    .find((i) => i.id === invoiceId);
  if (!invoice) {
    return (
      <section className="w-card">
        <h3>{invoiceId}</h3>
        <p className="w-muted">Not found.</p>
      </section>
    );
  }
  const taken = payments[invoiceId] ?? [];
  const paid = taken.reduce((sum, p) => sum + p.amount, 0);
  return (
    <section className="w-card">
      <h3>
        {invoice.id} · <span className={`w-pill w-${invoice.status}`}>{invoice.status}</span>
      </h3>
      <p className="w-big">£{invoice.amount}</p>
      <ul className="w-list">
        {taken.map((p, index) => (
          <li key={index}>
            <span>{p.on}</span>
            <span>{p.card}</span>
            <span className="w-num">£{p.amount}</span>
          </li>
        ))}
      </ul>
      {paid > invoice.amount && (
        <p className="w-overdue">
          Charged £{paid} for a £{invoice.amount} invoice.
        </p>
      )}
      <button type="button" onClick={() => onDispute?.({ invoiceId })}>
        Dispute a charge
      </button>
    </section>
  );
}
