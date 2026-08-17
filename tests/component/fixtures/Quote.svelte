<script lang="ts">
  // Svelte views read the bridge's props directly — see mountly-mcp/svelte.
  let { toolResult, hostContext } = $props();
</script>

<section data-testid="quote" data-theme={hostContext?.theme ?? "unset"}>
  <h1>Total due</h1>
  <p data-testid="total">
    {toolResult?.structuredContent?.total ?? "—"}
    {toolResult?.structuredContent?.currency ?? ""}
  </p>
</section>

<style>
  section {
    color: rgb(0, 0, 255);
  }
</style>
