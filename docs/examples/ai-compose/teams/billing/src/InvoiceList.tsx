import { invoices } from "./data";

interface Props {
  /** Customer id, e.g. `cus_ada`. */
  customerId: string;
  /** Which invoices to show. Defaults to all of them. */
  status?: "paid" | "overdue" | "open" | "all";
  /** How many to show, newest first. @minimum 1 @maximum 20 */
  limit?: number;
  /** Fired when the user picks an invoice. Detail: `{ invoiceId }`. */
  onPickInvoice?: (detail: { invoiceId: string }) => void;
}

/** A customer's invoices with amount, due date and status. Use to find or check a particular charge or invoice, or to list overdue ones. */
export default function InvoiceList({ customerId, status = "all", limit, onPickInvoice }: Props) {
  const rows = (invoices[customerId] ?? [])
    .filter((i) => status === "all" || i.status === status)
    .slice(0, limit);
  return (
    <section className="w-card">
      <h3>Invoices{status !== "all" ? ` · ${status}` : ""}</h3>
      {rows.length === 0 && <p className="w-muted">No invoices.</p>}
      <ul className="w-list">
        {rows.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onPickInvoice?.({ invoiceId: i.id })}>
              <span>{i.id}</span>
              <span className={`w-pill w-${i.status}`}>{i.status}</span>
              <span className="w-num">£{i.amount}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
