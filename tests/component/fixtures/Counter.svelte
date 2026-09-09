<script lang="ts">
  interface Props {
    balance: number;
  }
  let { balance }: Props = $props();
  let clicks = $state(0);
</script>

<section>
  <p data-testid="balance">{balance}</p>
  <button onclick={() => clicks++}>clicked {clicks}</button>
</section>
