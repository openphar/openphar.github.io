<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'

const route = useRoute()
const publisher = computed(() => route.params.publisher)
const category = computed(() => route.params.category)
const slug = computed(() => route.params.slug)

const monograph = ref(null)
const loading = ref(true)
const error = ref(null)

useHead({
  title: () => monograph.value ? `${extractString(monograph.value.prefLabel || monograph.value['rdfs:label'])} - Open Pharmacopoeia` : 'Loading...',
  meta: [
    { name: 'description', content: () => monograph.value?.definition || '' }
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

// Extract array from value
function extractArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  return [value]
}

const publisherNames = {
  jp: 'Japan Pharmacopoeia',
  phint: 'International Pharmacopoeia'
}

const publisherName = computed(() => publisherNames[publisher.value] || publisher.value)

const testSpecifications = computed(() => {
  if (!monograph.value) return []
  return extractArray(monograph.value.testSpecification || monograph.value['op:testSpecification'])
})

const assaySpecs = computed(() => {
  if (!monograph.value) return []
  return extractArray(monograph.value.assay || monograph.value['op:assay'])
})

onMounted(async () => {
  loading.value = true
  error.value = null

  try {
    // Try to load from aggregate file first
    const response = await fetch(`/data/${publisher.value}/${publisher.value}-monographs.jsonld`)
    const data = await response.json()
    const monographs = data['@graph'] || []

    // Find the specific monograph
    monograph.value = monographs.find(m => {
      const id = m['@id'] || ''
      return id.includes(`/${category.value}/${slug.value}`)
    })

    if (!monograph.value) {
      error.value = 'Monograph not found'
    }
  } catch (e) {
    console.error('Failed to load monograph:', e)
    error.value = 'Failed to load monograph'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
      <p class="mt-4 text-gray-600">Loading monograph...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12">
      <div class="text-red-500 mb-4">
        <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">{{ error }}</h2>
      <RouterLink :to="`/pharmacopoeia/${publisher}`" class="text-primary-600 hover:underline">
        Back to {{ publisherName }}
      </RouterLink>
    </div>

    <!-- Monograph Content -->
    <div v-else-if="monograph" class="max-w-4xl mx-auto">
      <!-- Breadcrumb -->
      <nav class="mb-6 text-sm">
        <ol class="flex items-center space-x-2">
          <li><RouterLink to="/" class="text-gray-500 hover:text-gray-700">Home</RouterLink></li>
          <li><span class="text-gray-400">/</span></li>
          <li><RouterLink :to="`/pharmacopoeia/${publisher}`" class="text-gray-500 hover:text-gray-700">{{ publisherName }}</RouterLink></li>
          <li><span class="text-gray-400">/</span></li>
          <li><span class="text-gray-500">{{ category }}</span></li>
          <li><span class="text-gray-400">/</span></li>
          <li><span class="text-gray-900 font-medium">{{ slug }}</span></li>
        </ol>
      </nav>

      <!-- Header -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6">
        <div class="flex items-start justify-between">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 mb-2">
              {{ extractString(monograph.prefLabel || monograph['rdfs:label']) }}
            </h1>
            <p class="text-gray-500 mb-4">{{ monograph['@id'] }}</p>
          </div>
          <span :class="`badge badge-${publisher}`">{{ publisher.toUpperCase() }}</span>
        </div>

        <div v-if="monograph.definition || monograph['op:definition']" class="mt-4">
          <h3 class="font-semibold text-gray-900 mb-2">Definition</h3>
          <p class="text-gray-700">{{ extractString(monograph.definition || monograph['op:definition']) }}</p>
        </div>
      </div>

      <!-- Test Specifications -->
      <div v-if="testSpecifications.length > 0" class="bg-white rounded-xl shadow-md p-6 mb-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Test Specifications</h2>
        <div class="space-y-4">
          <div v-for="(spec, index) in testSpecifications" :key="index" class="border-b border-gray-200 pb-4 last:border-0">
            <h4 class="font-medium text-gray-900">{{ extractString(spec.testName || spec['op:testName']) }}</h4>
            <dl class="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div v-if="spec.testType || spec['op:testType']">
                <dt class="text-gray-500">Test Type</dt>
                <dd class="text-gray-900">{{ extractString(spec.testType || spec['op:testType']) }}</dd>
              </div>
              <div v-if="spec.limitValue || spec['op:limitValue']">
                <dt class="text-gray-500">Limit</dt>
                <dd class="text-gray-900">
                  {{ spec.limitType || spec['op:limitType'] }} {{ spec.limitValue || spec['op:limitValue'] }}
                  {{ spec.limitUnit || spec['op:limitUnit'] || '' }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <!-- Assay Specifications -->
      <div v-if="assaySpecs.length > 0" class="bg-white rounded-xl shadow-md p-6 mb-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Assay</h2>
        <div class="space-y-4">
          <div v-for="(assay, index) in assaySpecs" :key="index" class="border-b border-gray-200 pb-4 last:border-0">
            <dl class="grid grid-cols-2 gap-2 text-sm">
              <div v-if="assay.assayTarget || assay['op:assayTarget']">
                <dt class="text-gray-500">Target</dt>
                <dd class="text-gray-900">{{ extractString(assay.assayTarget || assay['op:assayTarget']) }}</dd>
              </div>
              <div v-if="assay.limitValue || assay['op:limitValue']">
                <dt class="text-gray-500">Limit</dt>
                <dd class="text-gray-900">
                  {{ assay.limitType || assay['op:limitType'] }} {{ assay.limitValue || assay['op:limitValue'] }}
                  {{ assay.limitUnit || assay['op:limitUnit'] || '' }}
                </dd>
              </div>
              <div v-if="assay.method || assay['op:method']">
                <dt class="text-gray-500">Method</dt>
                <dd class="text-gray-900">{{ extractString(assay.method || assay['op:method']) }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <!-- Raw Data Toggle -->
      <details class="bg-white rounded-xl shadow-md p-6">
        <summary class="cursor-pointer font-semibold text-gray-900">View Raw JSON-LD</summary>
        <pre class="mt-4 p-4 bg-gray-100 rounded-lg overflow-auto text-sm">{{ JSON.stringify(monograph, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>
