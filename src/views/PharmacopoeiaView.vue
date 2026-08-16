<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import MonographCard from '../components/monograph/MonographCard.vue'
import { loadRegistry } from '../lib/registry'

const route = useRoute()
const publisher = computed(() => route.params.publisher)

const meta = ref(null)
const monographs = ref([])
const categories = ref([])
const selectedCategory = ref('')
const searchQuery = ref('')
const loading = ref(true)

useHead({
  title: () => `${meta.value?.name || 'Pharmacopoeia'} — Open Pharmacopoeia`,
  meta: [
    { name: 'description', content: () => `Browse the ${meta.value?.name || ''} dataset in the Open Pharmacopoeia registry.` }
  ]
})

function extractString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value['en'] || value['ja'] || value['zh'] || value['la'] || Object.values(value)[0] || ''
  }
  return String(value)
}

function isEntry(item) {
  const type = item['@type']
  const types = Array.isArray(type) ? type : [type]
  return types.some(t => typeof t === 'string' && (t.endsWith('Monograph') || t === 'TitleIndexEntry'))
}

function entryCategory(m) {
  if (typeof m.category === 'string' && m.category) return m.category
  const match = (m['@id'] || '').match(/\/data\/[^/]+\/([^/]+)\//)
  return match ? match[1] : 'other'
}

function entrySlug(m) {
  const parts = (m['@id'] || '').split('/')
  return parts[parts.length - 1] || parts[parts.length - 2]
}

function entryRestricted(m) {
  const type = m['@type']
  const types = Array.isArray(type) ? type : [type]
  return types.includes('TitleIndexEntry')
}

const filteredMonographs = computed(() => {
  let result = monographs.value
  if (selectedCategory.value) {
    result = result.filter(m => entryCategory(m) === selectedCategory.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(m => extractString(m.prefLabel).toLowerCase().includes(q))
  }
  return result.slice(0, 120)
})

onMounted(async () => {
  loading.value = true
  try {
    const registry = await loadRegistry()
    meta.value = registry.find(d => d.id === publisher.value)

    if (meta.value && meta.value.status !== 'raw') {
      const response = await fetch(`/data/${publisher.value}/${publisher.value}-monographs.jsonld`)
      if (response.ok) {
        const data = await response.json()
        monographs.value = (data['@graph'] || []).filter(isEntry)
        const categorySet = new Set(monographs.value.map(entryCategory))
        categories.value = Array.from(categorySet).filter(c => c !== 'other').sort()
      }
    }
  } catch (e) {
    console.error('Failed to load dataset:', e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <!-- Dataset header -->
    <div class="border-b border-line bg-paperdeep">
      <div class="container mx-auto px-4 py-10">
        <p class="eyebrow">Dataset</p>
        <div class="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 class="font-display text-4xl font-semibold tracking-tight text-ink">
            <span class="text-pine">{{ meta?.short || publisher }}</span>
            <span class="text-ink/35"> · </span>
            <span>{{ meta?.name || publisher }}</span>
          </h1>
          <span v-if="meta?.nativeName" class="latin text-xl text-ink/60">{{ meta.nativeName }}</span>
        </div>
        <p class="mt-2 text-sm text-ink/65">
          {{ meta?.organization }}
          <a v-if="meta?.sourceUrl" :href="meta.sourceUrl" class="ml-2 font-mono text-[11px] text-moss underline decoration-brass/60 underline-offset-2 hover:text-pine">official source ↗</a>
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
          <span class="rounded-sm bg-pine/10 px-2 py-1 text-pine">{{ meta?.edition }}</span>
          <span
            v-if="meta"
            class="rounded-sm px-2 py-1"
            :class="meta.rights === 'title-only' ? 'bg-oxblood/10 text-oxblood' : 'bg-moss/10 text-moss'"
          >
            {{ meta.rights === 'title-only' ? 'Index only — content under copyright' : 'Full text — open data' }}
          </span>
          <span v-if="monographs.length" class="rounded-sm bg-ink/5 px-2 py-1 text-ink/70">
            {{ monographs.length.toLocaleString() }} entries
          </span>
        </div>

        <!-- Restriction banner -->
        <div
          v-if="meta?.rights === 'title-only'"
          class="mt-5 max-w-3xl rounded-sm border-l-4 border-oxblood bg-oxblood/[0.06] px-4 py-3 text-sm text-ink/80"
        >
          The full text of this pharmacopoeia is copyrighted and is not published here.
          We list titles and link each entry to its counterparts in the open
          pharmacopoeias and to ICH&nbsp;Q4 harmonized methods.
          <a v-if="meta.restriction?.url" :href="meta.restriction.url" class="whitespace-nowrap font-medium text-oxblood underline underline-offset-2">
            {{ meta.restriction.notice }} ↗
          </a>
        </div>

        <!-- Raw status banner -->
        <div
          v-else-if="meta?.status === 'raw'"
          class="mt-5 max-w-3xl rounded-sm border-l-4 border-brass bg-brass/[0.08] px-4 py-3 text-sm text-ink/80"
        >
          Source documents for this pharmacopoeia have been acquired and monograph
          extraction is in progress. Entries will appear here once extracted.
        </div>
      </div>
    </div>

    <!-- Filters + list -->
    <div class="container mx-auto px-4 py-8">
      <template v-if="meta?.status === 'raw'">
        <p class="py-12 text-center font-mono text-sm text-ink/50">No entries yet — extraction in progress.</p>
      </template>
      <template v-else>
        <div class="mb-6 flex flex-col gap-3 md:flex-row">
          <input
            v-model="searchQuery"
            type="search"
            :placeholder="`Filter entries in ${meta?.short || publisher}…`"
            class="w-full rounded-sm border border-line bg-paper px-4 py-2.5 text-sm focus:border-moss focus:outline-none focus:ring-1 focus:ring-moss"
          >
          <select
            v-model="selectedCategory"
            class="rounded-sm border border-line bg-paper px-4 py-2.5 text-sm focus:border-moss focus:outline-none md:w-64"
          >
            <option value="">All categories</option>
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <div v-if="loading" class="py-16 text-center">
          <div class="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-line border-t-pine"></div>
          <p class="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-ink/50">Loading entries…</p>
        </div>

        <div v-else>
          <p class="mb-4 font-mono text-xs text-ink/55">
            Showing {{ filteredMonographs.length }} of {{ monographs.length.toLocaleString() }} entries
          </p>

          <div v-if="filteredMonographs.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <MonographCard
              v-for="m in filteredMonographs"
              :key="m['@id']"
              :monograph="m"
              :publisher="publisher"
              :category="entryCategory(m)"
              :slug="entrySlug(m)"
              :restricted="entryRestricted(m)"
              :edition="typeof m.edition === 'string' ? m.edition : ''"
            />
          </div>
          <p v-else class="py-12 text-center font-mono text-sm text-ink/50">No entries match this filter.</p>
        </div>
      </template>
    </div>
  </div>
</template>
