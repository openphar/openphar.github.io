<script setup>
import { ref, onMounted } from 'vue'
import { useHead } from '@unhead/vue'
import { extractString } from '../lib/i18n'

useHead({
  title: 'Compare Monographs - Open Pharmacopoeia',
  meta: [
    { name: 'description', content: 'Compare pharmacopoeia monographs across different publishers' }
  ]
})

const searchQuery = ref('')
const jpResults = ref([])
const phintResults = ref([])
const loading = ref(false)

async function searchMonographs() {
  if (!searchQuery.value || searchQuery.value.length < 2) {
    jpResults.value = []
    phintResults.value = []
    return
  }

  loading.value = true
  const query = searchQuery.value.toLowerCase()

  try {
    // Search JP
    const jpResponse = await fetch('/data/jp/jp-monographs.jsonld')
    const jpData = await jpResponse.json()
    jpResults.value = (jpData['@graph'] || [])
      .filter(m => {
        const name = extractString(m.prefLabel || m['rdfs:label']).toLowerCase()
        return name.includes(query)
      })
      .slice(0, 10)
  } catch (e) {
    console.error('Failed to search JP:', e)
    jpResults.value = []
  }

  loading.value = false
}
</script>

<template>
  <div class="container mx-auto px-4 py-10">
    <p class="eyebrow">Data service</p>
    <h1 class="mt-2 font-display text-4xl font-semibold tracking-tight">Compare Monographs</h1>

    <div class="bg-paper rounded-xl shadow-md p-6 mb-6">
      <p class="text-ink/70 mb-4">
        Search for a substance to compare its specifications across different pharmacopoeia publishers.
      </p>
      <div class="flex gap-4">
        <input
          v-model="searchQuery"
          @input="searchMonographs"
          type="text"
          placeholder="Enter substance name (e.g., paracetamol, aspirin)"
          class="flex-1 px-4 py-2 border border-line rounded-lg focus:ring-2 focus:ring-moss focus:border-moss"
        />
      </div>
    </div>

    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
    </div>

    <div v-else-if="jpResults.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- JP Results -->
      <div>
        <h2 class="text-xl font-semibold text-ink mb-4 flex items-center">
          <span class="badge badge-jp mr-2">JP</span>
          Japan Pharmacopoeia
        </h2>
        <div class="space-y-4">
          <div v-for="monograph in jpResults" :key="monograph['@id']" class="bg-paper rounded-lg shadow-md p-4">
            <h3 class="font-semibold text-ink">{{ extractString(monograph.prefLabel || monograph['rdfs:label']) }}</h3>
            <p class="text-sm text-ink/55 mt-1">{{ monograph['@id'] }}</p>
            <details class="mt-2">
              <summary class="text-sm text-pine cursor-pointer">View details</summary>
              <pre class="mt-2 p-2 bg-wash rounded text-xs overflow-auto">{{ JSON.stringify(monograph, null, 2) }}</pre>
            </details>
          </div>
        </div>
      </div>

      <!-- Ph.Int. Results -->
      <div>
        <h2 class="text-xl font-semibold text-ink mb-4 flex items-center">
          <span class="badge badge-phint mr-2">Ph.Int.</span>
          International Pharmacopoeia
        </h2>
        <div v-if="phintResults.length > 0" class="space-y-4">
          <div v-for="monograph in phintResults" :key="monograph['@id']" class="bg-paper rounded-lg shadow-md p-4">
            <h3 class="font-semibold text-ink">{{ extractString(monograph.prefLabel || monograph['rdfs:label']) }}</h3>
            <p class="text-sm text-ink/55 mt-1">{{ monograph['@id'] }}</p>
          </div>
        </div>
        <div v-else class="bg-wash rounded-lg p-8 text-center text-ink/55">
          No matching monographs found in Ph.Int.
        </div>
      </div>
    </div>

    <div v-else-if="searchQuery && searchQuery.length >= 2" class="text-center py-12 text-ink/55">
      No results found for "{{ searchQuery }}"
    </div>

    <div v-else class="text-center py-12 text-ink/55">
      Enter a search query to compare monographs across publishers.
    </div>
  </div>
</template>
