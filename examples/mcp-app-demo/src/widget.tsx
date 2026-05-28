import { createMcpWidget, useToolResult } from "mountly-mcp-react";
import {
  PaymentBreakdown,
  type PaymentBreakdownData,
} from "payment-breakdown/peer";
import styles from "../../payment-breakdown/src/styles.generated.css";

interface PaymentToolResult {
  structuredContent?: PaymentBreakdownData;
}

function PaymentWidget() {
  const result = useToolResult<PaymentToolResult>();
  const data = result?.structuredContent;
  if (!data) return null;
  return <PaymentBreakdown data={data} />;
}

const widget = createMcpWidget(PaymentWidget, { shadow: true, styles });

(globalThis as { __mountlyMcpWidget__?: unknown }).__mountlyMcpWidget__ =
  widget;
