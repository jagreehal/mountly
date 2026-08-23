import { createMcpView, useToolResult } from "mountly-mcp/react";
import { PaymentBreakdown, type PaymentBreakdownData } from "payment-breakdown/peer";
import styles from "../../payment-breakdown/src/styles.generated.css";

interface PaymentToolResult {
  structuredContent?: PaymentBreakdownData;
}

function PaymentView() {
  const result = useToolResult<PaymentToolResult>();
  const data = result?.structuredContent;
  if (!data) return null;
  return <PaymentBreakdown data={data} />;
}

createMcpView(PaymentView, { shadow: true, styles });
