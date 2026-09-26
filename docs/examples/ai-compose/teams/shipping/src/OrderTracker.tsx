const orders: Record<string, { step: number; carrier: string; eta: string }> = {
  ord_77: { step: 2, carrier: "DPD", eta: "Fri 26 Sep" },
  ord_81: { step: 3, carrier: "Royal Mail", eta: "Delivered" },
};
const steps = ["Ordered", "Packed", "Shipped", "Delivered"];

interface Props {
  /** Order id, e.g. `ord_77`. */
  orderId: string;
}

/** Where an order is: ordered → packed → shipped → delivered, with carrier and ETA. Use for "where is my order". */
export default function OrderTracker({ orderId }: Props) {
  const order = orders[orderId];
  if (!order)
    return (
      <section className="w-card">
        <h3>Order {orderId}</h3>
        <p className="w-muted">Not found.</p>
      </section>
    );
  return (
    <section className="w-card">
      <h3>Order {orderId}</h3>
      <ol className="w-steps">
        {steps.map((label, index) => (
          <li key={label} data-done={index <= order.step || undefined}>
            {label}
          </li>
        ))}
      </ol>
      <p className="w-muted">
        {order.carrier} · {order.eta}
      </p>
    </section>
  );
}
