<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { emitCounterChanged, onCounterChanged } from "./bus";

const count = ref(0);
const reactPeer = ref(0);
const sveltePeer = ref(0);
let stop: (() => void) | null = null;

onMounted(() => {
  stop = onCounterChanged((e) => {
    if (e.source === "react") reactPeer.value = e.value;
    if (e.source === "svelte") sveltePeer.value = e.value;
  });
});

onUnmounted(() => stop?.());

function bump(): void {
  count.value += 1;
  emitCounterChanged({ source: "vue", value: count.value });
}
</script>

<template>
  <section class="vue-card">
    <h2>Vue Widget</h2>
    <p>vue={{ count }} | react={{ reactPeer }} | svelte={{ sveltePeer }}</p>
    <button @click="bump">+ Vue</button>
  </section>
</template>

<style>
.vue-card {
  border: 2px solid rgb(60, 140, 220);
  color: rgb(60, 140, 220);
  padding: 8px;
  margin: 8px 0;
  border-radius: 8px;
}
</style>
