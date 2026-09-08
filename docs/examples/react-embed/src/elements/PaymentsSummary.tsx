import { useState } from "react";
import styles from "./PaymentsSummary.module.css";

export interface PaymentsSummaryProps {
  balance: number;
  currency: string;
  compact?: boolean;
  lineItems?: Array<{ label: string; amount: number }>;
  onViewDetails?: (detail: { balance: number }) => void;
}

export default function PaymentsSummary({
  balance,
  currency,
  compact = false,
  lineItems = [],
  onViewDetails,
}: PaymentsSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={compact ? styles.compact : styles.summary} aria-label="Payments summary">
      <h2>Payments</h2>
      <p>
        {currency} {balance}
      </p>
      <button
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          onViewDetails?.({ balance });
        }}
      >
        View details
      </button>
      {expanded && (
        <ul>
          {lineItems.map((item) => (
            <li key={item.label}>
              {item.label}: {item.amount}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
