<script lang="ts">
  import { onMount } from "svelte";
  import { emitCounterChanged, onCounterChanged } from "./bus";

  let count = 0;
  let reactPeer = 0;
  let vuePeer = 0;

  onMount(() => {
    const stop = onCounterChanged((e) => {
      if (e.source === "react") reactPeer = e.value;
      if (e.source === "vue") vuePeer = e.value;
    });
    return stop;
  });

  function bump() {
    count += 1;
    emitCounterChanged({ source: "svelte", value: count });
  }
</script>

<section class="sv-card">
  <h2>Svelte Widget</h2>
  <p>svelte={count} | react={reactPeer} | vue={vuePeer}</p>
  <button on:click={bump}>+ Svelte</button>
</section>

<style>
  .sv-card {
    border: 2px solid rgb(50, 160, 100);
    color: rgb(50, 160, 100);
    padding: 8px;
    margin: 8px 0;
    border-radius: 8px;
  }
</style>
