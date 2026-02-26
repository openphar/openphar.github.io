<script setup>
import { ref, onMounted } from 'vue'
import { useHead } from '@unhead/vue'

useHead({
  title: 'Open Pharmacopoeia - Unified Knowledge Graph',
  meta: [
    { name: 'description', content: 'Open Pharmacopoeia provides a unified knowledge graph for pharmacopoeia standards from multiple publishers including JP, Ph.Int., and more.' }
  ]
})

const stats = ref({
  jpMonographs: 0,
  phintMonographs: 0,
  crossLinks: 0
})

const publishers = [
  {
    id: 'jp',
    name: 'Japan Pharmacopoeia',
    edition: '18th Edition (JP18)',
    color: 'bg-red-600',
    borderColor: 'border-red-600',
    description: 'Official Japanese pharmaceutical standards including crude drugs, chemical drugs, and formulations.'
  },
  {
    id: 'phint',
    name: 'International Pharmacopoeia',
    edition: '13th Edition (Ph.Int.13)',
    color: 'bg-blue-600',
    borderColor: 'border-blue-600',
    description: 'WHO international standards for pharmaceutical substances, radiopharmaceuticals, and methods.'
  }
]

onMounted(async () => {
  try {
    const response = await fetch('/data/jp/jp-monographs.jsonld')
    const data = await response.json()
    const allItems = data['@graph'] || []

    // Count only actual monographs (types ending with "Monograph")
    const monographs = allItems.filter(item => {
      const type = item['@type']
      if (Array.isArray(type)) {
        return type.some(t => typeof t === 'string' && t.endsWith('Monograph'))
      }
      return typeof type === 'string' && type.endsWith('Monograph')
    })

    stats.value.jpMonographs = monographs.length
  } catch (e) {
    console.error('Failed to load JP stats:', e)
  }
})
</script>

<template>
  <div>
    <!-- Hero Section -->
    <section class="text-center py-16 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl mb-12">
      <h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
        Open Pharmacopoeia
      </h1>
      <p class="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
        Unified knowledge graph for pharmacopoeia standards. Compare monographs across publishers, explore harmonized methods, and access machine-readable data.
      </p>
      <div class="flex justify-center space-x-4">
        <RouterLink to="/search" class="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors">
          Search Monographs
        </RouterLink>
        <RouterLink to="/compare" class="px-6 py-3 bg-white text-gray-700 rounded-lg font-medium border border-gray-300 hover:bg-gray-50 transition-colors">
          Compare Publishers
        </RouterLink>
      </div>
    </section>

    <!-- Stats Section -->
    <section class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
      <div class="bg-white rounded-xl shadow-md p-6 text-center">
        <div class="text-3xl font-bold text-primary-600">{{ stats.jpMonographs.toLocaleString() }}</div>
        <div class="text-gray-600">JP Monographs</div>
      </div>
      <div class="bg-white rounded-xl shadow-md p-6 text-center">
        <div class="text-3xl font-bold text-blue-600">{{ stats.phintMonographs.toLocaleString() }}</div>
        <div class="text-gray-600">Ph.Int. Monographs</div>
      </div>
      <div class="bg-white rounded-xl shadow-md p-6 text-center">
        <div class="text-3xl font-bold text-green-600">{{ stats.crossLinks.toLocaleString() }}</div>
        <div class="text-gray-600">Cross-Publisher Links</div>
      </div>
    </section>

    <!-- Publishers Section -->
    <section>
      <h2 class="text-2xl font-bold text-gray-900 mb-6">Pharmacopoeia Publishers</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RouterLink
          v-for="publisher in publishers"
          :key="publisher.id"
          :to="`/pharmacopoeia/${publisher.id}`"
          class="card border-l-4"
          :class="publisher.borderColor"
        >
          <div class="flex items-start">
            <div class="w-12 h-12 rounded-lg flex items-center justify-center text-white mr-4" :class="publisher.color">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900">{{ publisher.name }}</h3>
              <p class="text-sm text-gray-500 mb-2">{{ publisher.edition }}</p>
              <p class="text-gray-600 text-sm">{{ publisher.description }}</p>
            </div>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- Features Section -->
    <section class="mt-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">Features</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white rounded-xl shadow-md p-6">
          <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h3 class="font-semibold text-gray-900 mb-2">Cross-Publisher Comparison</h3>
          <p class="text-gray-600 text-sm">Compare monographs for the same substance across different pharmacopoeia publishers.</p>
        </div>
        <div class="bg-white rounded-xl shadow-md p-6">
          <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <h3 class="font-semibold text-gray-900 mb-2">Machine-Readable Data</h3>
          <p class="text-gray-600 text-sm">Access all data as JSON-LD, Turtle, or through our SPARQL endpoint.</p>
        </div>
        <div class="bg-white rounded-xl shadow-md p-6">
          <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h3 class="font-semibold text-gray-900 mb-2">Harmonized Methods</h3>
          <p class="text-gray-600 text-sm">Test methods harmonized across publishers for easy comparison.</p>
        </div>
      </div>
    </section>
  </div>
</template>
