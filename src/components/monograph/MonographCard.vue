<script setup>
import { computed } from 'vue'

const props = defineProps({
  monograph: {
    type: Object,
    required: true
  },
  publisher: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    required: true
  }
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

const name = computed(() => extractString(props.monograph.prefLabel || props.monograph['rdfs:label']))
</script>

<template>
  <RouterLink
    :to="`/pharmacopoeia/${publisher}/${category}/${slug}`"
    class="card block"
  >
    <div class="flex items-start justify-between">
      <h3 class="font-semibold text-gray-900 line-clamp-2">{{ name }}</h3>
      <span :class="`badge badge-${publisher}`">{{ publisher.toUpperCase() }}</span>
    </div>
    <p class="text-sm text-gray-500 mt-2 truncate">{{ category }}</p>
  </RouterLink>
</template>
