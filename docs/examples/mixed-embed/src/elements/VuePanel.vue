<script setup lang="ts">
interface Props {
  label: string;
  count: number;
}
defineProps<Props>();
defineEmits<{ "pick-method": [string] }>();
</script>

<template>
  <p data-testid="vue">vue {{ label }} {{ count }}</p>
</template>

<style scoped>
p {
  color: var(--vue-embed-color, rgb(44, 55, 66));
  padding: 8px;
  margin: 0;
}
</style>
