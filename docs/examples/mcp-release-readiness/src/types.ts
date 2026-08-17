export type CheckState = "pass" | "watch" | "block";
export type ReleaseDecision = "approve" | "hold";
export type DecisionState = "idle" | "saving" | "approved" | "held" | "error";

export interface ReleaseCheck {
  id: string;
  label: string;
  value: string;
  detail: string;
  state: CheckState;
}

export interface ReleaseReport {
  releaseId: string;
  service: string;
  environment: "staging" | "production";
  commit: string;
  owner: string;
  window: string;
  readiness: number;
  recommendation: "ship" | "hold";
  summary: string;
  checks: ReleaseCheck[];
}

export interface ReleaseToolResult {
  structuredContent?: ReleaseReport;
  isError?: boolean;
}
