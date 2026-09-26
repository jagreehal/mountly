import { useState } from "react";

interface Props {
  /** Order id to return, e.g. `ord_81`. */
  orderId: string;
  /** Fired when the user submits. Detail: `{ orderId, reason }`. */
  onStartReturn?: (detail: { orderId: string; reason: string }) => void;
}

/** Start a return for a delivered order: pick a reason and submit. Use when someone wants to send something back or get a refund for an item. */
export default function ReturnForm({ orderId, onStartReturn }: Props) {
  const [reason, setReason] = useState("damaged");
  return (
    <form
      className="w-card"
      onSubmit={(event) => {
        event.preventDefault();
        onStartReturn?.({ orderId, reason });
      }}
    >
      <h3>Return {orderId}</h3>
      <label>
        Reason{" "}
        <select value={reason} onChange={(event) => setReason(event.target.value)}>
          <option value="damaged">Arrived damaged</option>
          <option value="wrong">Wrong item</option>
          <option value="unwanted">No longer needed</option>
        </select>
      </label>
      <button type="submit">Start return</button>
    </form>
  );
}
