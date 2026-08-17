import { createApp } from "vue";
import ReleaseReadiness from "./ReleaseReadiness.vue";
import type { ReleaseReport } from "./types";
import "./preview.css";

const report: ReleaseReport = {
  releaseId: "rel_checkout_api_042",
  service: "checkout-api",
  environment: "production",
  commit: "8c1e2d4",
  owner: "Delivery Platform",
  window: "Today · 21:00–21:30 UTC",
  readiness: 68,
  recommendation: "hold",
  summary: "One migration risk and an incomplete canary window need an explicit owner decision.",
  checks: [
    {
      id: "error-budget",
      label: "Error budget",
      value: "71% remaining",
      detail: "Thirty-day burn is within the service policy.",
      state: "pass",
    },
    {
      id: "migration",
      label: "Schema migration",
      value: "2 destructive statements",
      detail: "Rollback SQL exists, but the lock estimate exceeds the normal threshold.",
      state: "block",
    },
    {
      id: "canary",
      label: "Canary sample",
      value: "8 of 15 minutes",
      detail: "No regression detected so far; the minimum observation window is incomplete.",
      state: "watch",
    },
    {
      id: "ownership",
      label: "Rollback owner",
      value: "Assigned",
      detail: "Delivery Platform is on call through the deployment window.",
      state: "pass",
    },
  ],
};

createApp(ReleaseReadiness, {
  report,
  onDecide: (decision: string) => console.info(`[release-preview] ${decision}`),
}).mount("#app");
