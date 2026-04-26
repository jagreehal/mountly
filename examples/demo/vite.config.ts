import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

interface MockPayment {
  total: number;
  currency: string;
  items: Array<{ description: string; amount: number; currency: string }>;
  tax?: number;
  discount?: number;
}

const PAYMENTS: Record<string, MockPayment> = {
  pay_123: {
    total: 149.99,
    currency: "USD",
    items: [
      { description: "Pro Plan (Monthly)", amount: 129.99, currency: "USD" },
      { description: "Additional Storage (10GB)", amount: 20.0, currency: "USD" },
    ],
    tax: 12.5,
    discount: 12.5,
  },
  pay_456: {
    total: 49.0,
    currency: "EUR",
    items: [{ description: "Starter Plan", amount: 49.0, currency: "EUR" }],
  },
};

function mockApi(): Plugin {
  return {
    name: "mountly-mock-api",
    configureServer(server) {
      server.middlewares.use("/api/payments", (req, res) => {
        const url = req.url ?? "/";
        const id = url.replace(/^\/+/, "").split(/[?#]/)[0] ?? "";
        // small artificial latency so loading state is observable
        setTimeout(() => {
          const payment = PAYMENTS[id];
          res.setHeader("content-type", "application/json");
          if (!payment) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: `payment ${id} not found` }));
            return;
          }
          res.statusCode = 200;
          res.end(JSON.stringify(payment));
        }, 150);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mockApi()],
  optimizeDeps: {
    exclude: [
      "mountly",
      "payment-breakdown",
      "image-lightbox",
    ],
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
