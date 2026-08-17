<script setup lang="ts">
import { computed, ref } from "vue";
import { useMcpHost, useToolResult } from "mountly-mcp/vue";
import ReleaseReadiness from "./ReleaseReadiness.vue";
import type { DecisionState, ReleaseDecision, ReleaseToolResult } from "./types";

const mcp = useMcpHost();
const result = useToolResult<ReleaseToolResult>();
const report = computed(() => result.value?.structuredContent);
const decisionState = ref<DecisionState>("idle");

async function recordDecision(decision: ReleaseDecision): Promise<void> {
  if (!report.value || decisionState.value === "saving") return;
  decisionState.value = "saving";

  try {
    const response = await mcp.callServerTool({
      name: "record_release_decision",
      arguments: { releaseId: report.value.releaseId, decision },
    });
    decisionState.value = response.isError ? "error" : decision === "approve" ? "approved" : "held";
  } catch {
    decisionState.value = "error";
  }
}
</script>

<template>
  <main class="mcp-release-view">
    <ReleaseReadiness
      v-if="report"
      :report="report"
      :decision-state="decisionState"
      @decide="recordDecision"
    />
    <div v-else class="awaiting" role="status">
      <span />
      Waiting for release signals…
    </div>
  </main>
</template>

<style scoped>
.mcp-release-view {
  min-height: 100%;
  padding: clamp(0.75rem, 3vw, 2rem);
}

.awaiting {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: center;
  min-height: 10rem;
  color: oklch(60% 0.02 75);
  font: 500 0.8125rem/1.5 var(--font-sans, "Mona Sans", sans-serif);
}

.awaiting span {
  width: 0.625rem;
  height: 0.625rem;
  border: 1px solid oklch(78% 0.15 75);
  border-radius: 50%;
  animation: pulse 1.2s ease-in-out infinite alternate;
}

@keyframes pulse {
  to {
    background: oklch(78% 0.15 75);
    transform: scale(0.72);
  }
}

@media (prefers-reduced-motion: reduce) {
  .awaiting span {
    animation: none;
    background: oklch(78% 0.15 75);
  }
}
</style>
