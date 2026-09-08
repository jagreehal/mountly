<script lang="ts">
  interface Props {
    rows: number;
  }
  let { rows }: Props = $props();
</script>

<p data-testid="svelte">svelte {rows}</p>
