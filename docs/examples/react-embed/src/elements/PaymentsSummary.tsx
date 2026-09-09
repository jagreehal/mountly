import { useState } from "react";
import "../styles.css";
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
      <h2 className="text-xs font-semibold tracking-widest uppercase opacity-60">Payments</h2>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {currency} {balance}
      </p>
      <button
        className="mt-3 rounded-md border border-current/30 px-3 py-1.5 text-sm font-medium hover:bg-current/5"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          onViewDetails?.({ balance });
        }}
      >
        View details
      </button>
      {expanded && (
        <ul className="mt-3 space-y-1 border-t border-current/20 pt-3 text-sm">
          {lineItems.map((item) => (
            <li key={item.label} className="flex justify-between gap-6 tabular-nums">
              <span>{item.label}</span>
              <span>{item.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
