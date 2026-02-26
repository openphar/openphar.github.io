<script setup>
import { useHead } from '@unhead/vue'

useHead({
  title: 'Open Pharmacopoeia',
  meta: [
    { name: 'description', content: 'Unified knowledge graph for pharmacopoeia standards' }
  ]
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <TheHeader />
    <main class="container mx-auto px-4 py-8">
      <RouterView />
    </main>
    <TheFooter />
  </div>
</template>
