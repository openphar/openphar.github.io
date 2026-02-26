<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import MonographCard from '../components/monograph/MonographCard.vue'

const route = useRoute()
const publisher = computed(() => route.params.publisher)

const publisherInfo = {
  jp: {
    name: 'Japan Pharmacopoeia',
    edition: '18th Edition',
    color: 'bg-red-600',
    description: 'The Japanese Pharmacopoeia (JP) is the official pharmacopoeia of Japan, published by the Ministry of Health, Labour and Welfare.'
  },
  phint: {
    name: 'International Pharmacopoeia',
    edition: '13th Edition',
    color: 'bg-blue-600',
    description: 'The International Pharmacopoeia (Ph.Int.) is published by the World Health Organization and provides international standards.'
  }
}

const currentPublisher = computed(() => publisherInfo[publisher.value] || {})
const monographs = ref([])
const categories = ref([])
const selectedCategory = ref('')
const searchQuery = ref('')
const loading = ref(true)

useHead({
  title: () => `${currentPublisher.value.name || 'Pharmacopoeia'} - Open Pharmacopoeia`,
  meta: [
    { name: 'description', content: () => currentPublisher.value.description }
  ]
})

// Extract string from LangString or string
function extractString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value['en'] || value['ja'] || value['@value'] || Object.values(value)[0] || ''
  }
  return String(value)
}

// Get monograph slug from @id
function getSlug(id) {
  if (!id) return ''
  const parts = id.split('/')
  return parts[parts.length - 1] || parts[parts.length - 2]
}

// Get category from @id
// Format: https://www.openphar.org/data/jp/{category}/{slug}
function getCategory(id) {
  if (!id) return 'other'
  const match = id.match(/\/data\/[^/]+\/([^/]+)\//)
  return match ? match[1] : 'other'
}

// Check if item is a monograph (type ending with "Monograph")
function isMonograph(item) {
  const type = item['@type']
  if (Array.isArray(type)) {
    return type.some(t => typeof t === 'string' && t.endsWith('Monograph'))
  }
  return typeof type === 'string' && type.endsWith('Monograph')
}

const filteredMonographs = computed(() => {
  let result = monographs.value

  if (selectedCategory.value) {
    result = result.filter(m => getCategory(m['@id']) === selectedCategory.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(m => {
      const name = extractString(m.prefLabel || m['rdfs:label']).toLowerCase()
      return name.includes(query)
    })
  }

  return result.slice(0, 100) // Limit to 100 for performance
})

onMounted(async () => {
  loading.value = true
  try {
    const response = await fetch(`/data/${publisher.value}/${publisher.value}-monographs.jsonld`)
    const data = await response.json()
    const allItems = data['@graph'] || []

    // Filter to only actual monographs
    monographs.value = allItems.filter(isMonograph)

    // Extract unique categories
    const categorySet = new Set()
    monographs.value.forEach(m => {
      categorySet.add(getCategory(m['@id']))
    })
    categories.value = Array.from(categorySet).filter(c => c !== 'other').sort()
  } catch (e) {
    console.error('Failed to load monographs:', e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <!-- Publisher Header -->
    <div class="mb-8">
      <div class="flex items-center mb-4">
        <div class="w-12 h-12 rounded-lg flex items-center justify-center text-white mr-4" :class="currentPublisher.color">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-900">{{ currentPublisher.name }}</h1>
          <p class="text-gray-500">{{ currentPublisher.edition }}</p>
        </div>
      </div>
      <p class="text-gray-600 max-w-3xl">{{ currentPublisher.description }}</p>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-xl shadow-md p-4 mb-6">
      <div class="flex flex-col md:flex-row gap-4">
        <div class="flex-1">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search monographs..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div class="w-full md:w-64">
          <select
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

    <!-- Monographs List -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading monographs...</p>
    </div>

    <div v-else>
      <p class="text-gray-600 mb-4">
        Showing {{ filteredMonographs.length }} of {{ monographs.length }} monographs
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MonographCard
          v-for="monograph in filteredMonographs"
          :key="monograph['@id']"
          :monograph="monograph"
          :publisher="publisher"
          :category="getCategory(monograph['@id'])"
          :slug="getSlug(monograph['@id'])"
        />
      </div>
    </div>
  </div>
</template>
