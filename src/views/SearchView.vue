<script setup>
import { ref, computed, onMounted } from 'vue'
import { useHead } from '@unhead/vue'
import MonographCard from '../components/monograph/MonographCard.vue'

useHead({
  title: 'Search - Open Pharmacopoeia',
  meta: [
    { name: 'description', content: 'Search pharmacopoeia monographs across all publishers' }
  ]
})

const searchQuery = ref('')
const selectedPublisher = ref('')
const monographs = ref([])
const loading = ref(true)

// Extract string from LangString or string
function extractString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value['en'] || value['ja'] || value['@value'] || Object.values(value)[0] || ''
  }
  return String(value)
}

// Get category from @id
function getCategory(id) {
  if (!id) return 'other'
  const match = id.match(/\/monographs\/([^/]+)\//)
  return match ? match[1] : 'other'
}

// Get slug from @id
function getSlug(id) {
  if (!id) return ''
  const parts = id.split('/')
  return parts[parts.length - 1] || parts[parts.length - 2]
}

// Get publisher from @id
function getPublisher(id) {
  if (!id) return ''
  if (id.includes('/jp/')) return 'jp'
  if (id.includes('/phint/')) return 'phint'
  return 'other'
}

const filteredMonographs = computed(() => {
  let result = monographs.value

  if (selectedPublisher.value) {
    result = result.filter(m => getPublisher(m['@id']) === selectedPublisher.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(m => {
      const name = extractString(m.prefLabel || m['rdfs:label']).toLowerCase()
      return name.includes(query)
    })
  }

  return result.slice(0, 50) // Limit for performance
})

onMounted(async () => {
  loading.value = true
  try {
    // Load JP monographs
    const jpResponse = await fetch('/data/jp/jp-monographs.jsonld')
    const jpData = await jpResponse.json()
    const jpMonographs = (jpData['@graph'] || []).map(m => ({ ...m, publisher: 'jp' }))

    monographs.value = jpMonographs
  } catch (e) {
    console.error('Failed to load monographs:', e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Search Monographs</h1>

    <!-- Search Form -->
    <div class="bg-white rounded-xl shadow-md p-6 mb-6">
      <div class="flex flex-col md:flex-row gap-4">
        <div class="flex-1">
          <label for="search" class="block text-sm font-medium text-gray-700 mb-1">Search Query</label>
          <input
            id="search"
            v-model="searchQuery"
            type="text"
            placeholder="Enter monograph name..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div class="w-full md:w-48">
          <label for="publisher" class="block text-sm font-medium text-gray-700 mb-1">Publisher</label>
          <select
            id="publisher"
            v-model="selectedPublisher"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Publishers</option>
            <option value="jp">Japan (JP)</option>
            <option value="phint">International (Ph.Int.)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Results -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading monographs...</p>
    </div>

    <div v-else>
      <p class="text-gray-600 mb-4">
        Found {{ filteredMonographs.length }} monographs
        <span v-if="searchQuery || selectedPublisher">(filtered from {{ monographs.length }})</span>
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MonographCard
          v-for="monograph in filteredMonographs"
          :key="monograph['@id']"
          :monograph="monograph"
          :publisher="getPublisher(monograph['@id'])"
          :category="getCategory(monograph['@id'])"
          :slug="getSlug(monograph['@id'])"
        />
      </div>

      <div v-if="filteredMonographs.length === 0" class="text-center py-12 text-gray-500">
        No monographs found matching your criteria.
      </div>
    </div>
  </div>
</template>
