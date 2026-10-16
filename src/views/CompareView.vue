<script setup>
import { ref, onMounted } from 'vue'
import { useHead } from '@unhead/vue'
import { useRoute } from 'vue-router'
import { extractString } from '../lib/i18n'

const route = useRoute()

useHead({
  title: 'Compare Monographs - Open Pharmacopoeia',
  meta: [
    { name: 'description', content: 'Compare the same substance across pharmacopoeia publishers, resolved by the substance identity registry.' }
  ]
})

const searchQuery = ref('')
const candidates = ref([])
const columns = ref([])
const loading = ref(false)
const searched = ref(false)

let searchIndex = null
let crossLinks = null
let registryRights = null
const datasetCache = {}

async function ensureIndex() {
  if (!searchIndex) {
    searchIndex = await (await fetch('/data/search-index.json')).json()
  }
  if (!crossLinks) {
    crossLinks = await (await fetch('/data/cross-links.json')).json()
  }
  if (!registryRights) {
    const reg = await (await fetch('/data/registry.json')).json()
    registryRights = {}
    for (const ds of reg) registryRights[ds.id] = ds.rights
  }
}

function candidateMatches(row, q) {
  const hay = [row.t, row.n].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(q)
}

async function searchMonographs() {
  const q = searchQuery.value.trim().toLowerCase()
  if (q.length < 2) {
    candidates.value = []
    searched.value = false
    return
  }
  loading.value = true
  searched.value = true
  await ensureIndex()
  candidates.value = searchIndex.filter(r => candidateMatches(r, q)).slice(0, 20)
  loading.value = false
}

async function datasetEntry(datasetId, slug) {
  if (!datasetCache[datasetId]) {
    const res = await fetch(`/data/${datasetId}/${datasetId}-monographs.jsonld`)
    datasetCache[datasetId] = (await res.json())['@graph'] || []
  }
  return datasetCache[datasetId].find(m => (m['@id'] || '').endsWith(`/${slug}`)) ||
         datasetCache[datasetId].find(m => (m['@id'] || '').split('/').pop() === slug)
}

async function compareEntry(d, s) {
  loading.value = true
  await ensureIndex()
  const group = [{ d, s }, ...(crossLinks[`${d}/${s}`] || [])]
  const seen = new Set()
  const unique = group.filter(m => {
    const k = `${m.d}/${m.s}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  columns.value = await Promise.all(unique.map(async m => {
    const entry = await datasetEntry(m.d, m.s)
    const rights = registryRights[m.d]
    const restricted = rights === 'title-only'
    return {
      d: m.d,
      s: m.s,
      c: m.c || 'monographs',
      restricted,
      title: entry ? extractString(entry.prefLabel || entry['rdfs:label'] || {}) || m.s : m.s,
      edition: entry?.edition || '',
      definition: (!restricted && entry?.definition) ? Object.values(entry.definition)[0] : null,
      sections: (!restricted && entry?.sections) ? entry.sections.slice(0, 3) : []
    }
  }))
  loading.value = false
  history.replaceState(null, '', `/compare?entry=${d}/${s}`)
}

function onSelect(row) {
  compareEntry(row.d, row.s)
}

onMounted(() => {
  const entry = route.query.entry
  if (entry && entry.includes('/')) {
    const [d, s] = String(entry).split('/')
    searchQuery.value = s.replace(/-/g, ' ')
    compareEntry(d, s)
  }
})
</script>

<template>
  <div class="container mx-auto px-4 py-10">
    <p class="eyebrow">Data service</p>
    <h1 class="mt-2 font-display text-4xl font-semibold tracking-tight">Compare Monographs</h1>
    <p class="mt-3 max-w-2xl text-ink/70">
      Pick a monograph and the substance identity registry resolves the same
      substance across publishers. Copyrighted pharmacopoeias (USP, Ph.&nbsp;Eur.,
      BP) are shown title-only.
    </p>

    <div class="bg-paper rounded-xl shadow-md p-6 mb-6 mt-6">
      <input
        v-model="searchQuery"
        @input="searchMonographs"
        type="text"
        placeholder="Enter substance name (e.g., paracetamol, aspirin)"
        class="w-full px-4 py-2 border border-line rounded-lg focus:ring-2 focus:ring-moss focus:border-moss"
      />
      <div v-if="candidates.length" class="mt-3 divide-y divide-line border border-line rounded-lg max-h-80 overflow-auto">
        <button
          v-for="row in candidates"
          :key="row.d + '/' + row.s"
          @click="onSelect(row)"
          class="w-full text-left px-4 py-2 hover:bg-wash flex items-center gap-3"
        >
          <span class="badge" :class="'badge-' + row.d">{{ row.d.toUpperCase() }}</span>
          <span class="text-ink">{{ row.t }}</span>
          <span v-if="registryRights && registryRights[row.d] === 'title-only'" class="text-xs text-ink/50 ml-auto">title-only</span>
        </button>
      </div>
      <p v-else-if="searched && searchQuery.length >= 2 && !loading" class="mt-3 text-sm text-ink/55">
        No entries match “{{ searchQuery }}”.
      </p>
    </div>

    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
    </div>

    <div v-else-if="columns.length" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      <div v-for="col in columns" :key="col.d + '/' + col.s" class="bg-paper rounded-lg shadow-md p-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="badge" :class="'badge-' + col.d">{{ col.d.toUpperCase() }}</span>
          <span v-if="col.edition" class="text-xs text-ink/55">{{ col.edition }}</span>
          <span v-if="col.restricted" class="ml-auto text-xs px-2 py-0.5 rounded bg-wash text-ink/55">title-only</span>
        </div>
        <h3 class="font-semibold text-ink">
          <router-link :to="`/pharmacopoeia/${col.d}/${col.c}/${col.s}`" class="hover:underline">
            {{ col.title }}
          </router-link>
        </h3>
        <template v-if="!col.restricted">
          <p v-if="col.definition" class="text-sm text-ink/70 mt-2 line-clamp-4">{{ col.definition }}</p>
          <ul v-if="col.sections.length" class="mt-2 text-xs text-ink/60 list-disc list-inside">
            <li v-for="sec in col.sections" :key="sec.name">{{ sec.name }}</li>
          </ul>
        </template>
        <p v-else class="text-sm text-ink/55 mt-2">
          Body text not published — copyrighted pharmacopoeia (titles and edition only).
        </p>
      </div>
    </div>

    <div v-else-if="!loading" class="text-center py-12 text-ink/55">
      Search for a substance above, or open an entry and follow its counterpart links.
    </div>
  </div>
</template>
