// Stand-in for the billing API. The widget owns its data; the page passes ids.
export const invoices: Record<
  string,
  Array<{ id: string; amount: number; status: "paid" | "overdue" | "open"; due: string }>
> = {
  cus_ada: [
    { id: "INV-1042", amount: 1200, status: "overdue", due: "2026-09-01" },
    { id: "INV-1051", amount: 340, status: "open", due: "2026-10-01" },
    { id: "INV-0998", amount: 1200, status: "paid", due: "2026-08-01" },
  ],
  cus_lin: [{ id: "INV-2001", amount: 99, status: "paid", due: "2026-09-10" }],
};

/** Card payments taken against each invoice. INV-0998 was charged twice. */
export const payments: Record<string, Array<{ on: string; amount: number; card: string }>> = {
  "INV-0998": [
    { on: "2026-08-01", amount: 1200, card: "Visa ·· 4242" },
    { on: "2026-08-01", amount: 1200, card: "Visa ·· 4242" },
  ],
  "INV-2001": [{ on: "2026-09-10", amount: 99, card: "Amex ·· 1005" }],
};
