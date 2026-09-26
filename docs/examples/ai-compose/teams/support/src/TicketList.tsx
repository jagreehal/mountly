const tickets: Record<string, Array<{ id: string; subject: string; open: boolean }>> = {
  cus_ada: [
    { id: "T-310", subject: "Charged twice for September", open: true },
    { id: "T-288", subject: "Parcel left outside", open: false },
  ],
};

interface Props {
  /** Customer id, e.g. `cus_ada`. */
  customerId: string;
  /** Show only open tickets. */
  openOnly?: boolean;
}

/** A customer's support tickets and whether each is still open. Use for complaints, disputes or "did anyone reply". */
export default function TicketList({ customerId, openOnly = false }: Props) {
  const rows = (tickets[customerId] ?? []).filter((t) => !openOnly || t.open);
  return (
    <section className="w-card">
      <h3>Support tickets</h3>
      <ul className="w-list">
        {rows.map((t) => (
          <li key={t.id}>
            <span>{t.id}</span>
            <span>{t.subject}</span>
            <span className={`w-pill ${t.open ? "w-open" : "w-paid"}`}>
              {t.open ? "open" : "closed"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
