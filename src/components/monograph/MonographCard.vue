<script setup>
import { computed } from 'vue'

const props = defineProps({
  monograph: { type: Object, required: true },
  publisher: { type: String, required: true },
  category: { type: String, required: true },
  slug: { type: String, required: true },
  restricted: { type: Boolean, default: false },
  edition: { type: String, default: '' }
})

function extractString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value['en'] || value['ja'] || value['zh'] || value['la'] || value['@value'] || Object.values(value)[0] || ''
  }
  return String(value)
}

const name = computed(() => extractString(props.monograph.prefLabel || props.monograph['rdfs:label']))
const isLatin = computed(() => /^[A-Z][a-z]+ [a-z]+/.test(name.value))
const native = computed(() => {
  const labels = props.monograph.prefLabel || {}
  const entry = Object.entries(labels).find(([lang, v]) => lang !== 'en' && v && v !== name.value)
  return entry ? { lang: entry[0], value: entry[1] } : null
})
</script>

<template>
  <RouterLink
    :to="`/pharmacopoeia/${publisher}/${category}/${slug}`"
    class="flex flex-col rounded-sm border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
    :class="restricted
      ? 'border-oxblood/35 bg-oxblood/[0.04] hover:border-oxblood/70'
      : 'border-line bg-paper hover:border-moss'"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="line-clamp-2 text-[0.95rem] font-medium text-ink" :class="isLatin && !restricted ? 'latin' : ''">
          {{ name }}
        </h3>
        <p v-if="native" class="line-clamp-1 text-xs text-ink/55" :lang="native.lang">{{ native.value }}</p>
      </div>
      <span
        class="flex-shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
        :class="restricted ? 'bg-oxblood/10 text-oxblood' : 'bg-pine/10 text-pine'"
      >
        {{ restricted ? 'Index' : publisher.toUpperCase() }}
      </span>
    </div>
    <div class="mt-auto flex items-center justify-between pt-3 text-xs text-ink/55">
      <span class="truncate font-mono lowercase">{{ category }}</span>
      <span v-if="edition" class="ml-2 flex-shrink-0 font-mono text-[10px]">{{ edition }}</span>
    </div>
  </RouterLink>
</template>
