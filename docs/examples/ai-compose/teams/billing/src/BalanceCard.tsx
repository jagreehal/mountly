import { invoices } from "./data";

interface Props {
  /** Customer id, e.g. `cus_ada`. */
  customerId: string;
}

/** One big number: what the customer owes right now, and how much of it is overdue. Use for "what do I owe" or "how much is my balance". */
export default function BalanceCard({ customerId }: Props) {
  const rows = invoices[customerId] ?? [];
  const owed = rows.filter((i) => i.status !== "paid").reduce((sum, i) => sum + i.amount, 0);
  const overdue = rows.filter((i) => i.status === "overdue").reduce((sum, i) => sum + i.amount, 0);
  return (
    <section className="w-card">
      <h3>Balance</h3>
      <p className="w-big">£{owed}</p>
      {overdue > 0 && <p className="w-overdue">£{overdue} overdue</p>}
    </section>
  );
}
