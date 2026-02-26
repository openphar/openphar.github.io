<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useHead } from '@unhead/vue'
import { useSearch } from '../composables/useSearch'
import MonographCard from '../components/monograph/MonographCard.vue'

useHead({
  title: 'Search - Open Pharmacopoeia',
  meta: [
    { name: 'description', content: 'Search pharmacopoeia monographs across all publishers' }
  ]
})

const { loading, initialized, initialize, search, getAll, getCategories, getStats } = useSearch()

const searchQuery = ref('')
const selectedPublisher = ref('')
const selectedCategory = ref('')
const results = ref([])
const categories = ref([])
const stats = ref({ total: 0, byPublisher: {} })
const isSearching = ref(false)

// Debounce timer
let debounceTimer = null

// Perform search with debounce
function performSearch() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  debounceTimer = setTimeout(() => {
    isSearching.value = true

    try {
      if (searchQuery.value && searchQuery.value.length >= 2) {
        results.value = search(searchQuery.value, {
          publisher: selectedPublisher.value || undefined,
          category: selectedCategory.value || undefined,
          limit: 100
        })
      } else {
        results.value = getAll({
          publisher: selectedPublisher.value || undefined,
          category: selectedCategory.value || undefined,
          limit: 100
        })
      }
    } finally {
      isSearching.value = false
    }
  }, 300)
}

// Watch for changes
watch([searchQuery, selectedPublisher, selectedCategory], () => {
  if (initialized.value) {
    performSearch()
  }
})

// Initialize on mount
onMounted(async () => {
  await initialize()
  categories.value = getCategories()
  stats.value = getStats()
  results.value = getAll({ limit: 100 })
})

// Stats display
const jpCount = computed(() => stats.value.byPublisher?.jp || 0)
const phintCount = computed(() => stats.value.byPublisher?.phint || 0)
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Search Monographs</h1>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-2xl font-bold text-primary-600">{{ stats.total.toLocaleString() }}</div>
        <div class="text-gray-600 text-sm">Total Monographs</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-2xl font-bold text-red-600">{{ jpCount.toLocaleString() }}</div>
        <div class="text-gray-600 text-sm">JP Monographs</div>
      </div>
      <div class="bg-white rounded-lg shadow p-4 text-center">
        <div class="text-2xl font-bold text-blue-600">{{ phintCount.toLocaleString() }}</div>
        <div class="text-gray-600 text-sm">Ph.Int. Monographs</div>
      </div>
    </div>

    <!-- Search Form -->
    <div class="bg-white rounded-xl shadow-md p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="md:col-span-1">
          <label for="search" class="block text-sm font-medium text-gray-700 mb-1">Search Query</label>
          <input
            id="search"
            v-model="searchQuery"
            type="text"
            placeholder="Search by name, CAS number, formula..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
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
        <div>
          <label for="category" class="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            id="category"
            v-model="selectedCategory"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">All Categories</option>
            <option v-for="cat in categories" :key="cat" :value="cat">
              {{ cat }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading search index...</p>
    </div>

    <!-- Search Results -->
    <div v-else>
      <div class="flex justify-between items-center mb-4">
        <p class="text-gray-600">
          Showing {{ results.length }} monographs
          <span v-if="searchQuery">(searching for "{{ searchQuery }}")</span>
        </p>
        <div v-if="isSearching" class="text-gray-500">
          Searching...
        </div>
      </div>

      <div v-if="results.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MonographCard
          v-for="monograph in results"
          :key="monograph['@id']"
          :monograph="monograph"
          :publisher="monograph.publisher"
          :category="monograph.category"
          :slug="monograph.slug"
        />
      </div>

      <div v-else class="text-center py-12 bg-gray-50 rounded-lg">
        <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-gray-600">No monographs found matching your criteria.</p>
      </div>
    </div>
  </div>
</template>
