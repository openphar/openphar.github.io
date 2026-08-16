<script setup>
import { useHead } from '@unhead/vue'

useHead({
  title: 'Open Pharmacopoeia',
  meta: [
    { name: 'description', content: 'One open, semantic structure for the world’s pharmacopoeias — harmonized base layer from ICH Q4, extended by every national and traditional pharmacopoeia.' }
  ]
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-paper">
    <TheHeader />
    <main class="flex-1">
      <RouterView />
    </main>
    <TheFooter />
  </div>
</template>
