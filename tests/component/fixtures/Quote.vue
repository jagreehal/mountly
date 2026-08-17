<script setup lang="ts">
import { useHostContext, useToolResult } from "../../../packages/mcp-apps/src/vue/index";

interface Quote {
  total: number;
  currency: string;
}

const result = useToolResult<{ structuredContent: Quote }>();
const hostContext = useHostContext();
</script>

<template>
  <section data-testid="quote" :data-theme="hostContext?.theme ?? 'unset'">
    <h1>Total due</h1>
    <p data-testid="total">
      {{ result?.structuredContent?.total ?? "—" }}
      {{ result?.structuredContent?.currency ?? "" }}
    </p>
  </section>
</template>

<style>
/* Scoped by the shadow root the adapter attaches, not by a build step. */
section {
  color: rgb(0, 128, 0);
}
</style>
