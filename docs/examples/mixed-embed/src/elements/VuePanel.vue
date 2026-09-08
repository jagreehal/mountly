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
