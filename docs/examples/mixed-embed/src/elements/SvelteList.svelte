<script lang="ts">
  interface Props {
    rows: number;
  }
  let { rows }: Props = $props();
</script>

<p data-testid="svelte">svelte {rows}</p>

<style>
  p {
    color: var(--svelte-embed-color, rgb(77, 88, 99));
    padding: 8px;
    margin: 0;
  }
</style>
