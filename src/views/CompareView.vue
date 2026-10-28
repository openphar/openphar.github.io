<script setup>
import { ref, onMounted, computed } from 'vue'
import { extractString } from '../lib/i18n'
import { detailAccess, readComparisonProjection, findFacts, formatLimit, comparisonMatrix, resolveEntrySelection } from '../lib/comparison-contract.js'
import { readEditionProjection, editionsForEntry } from '../lib/edition-diff.js'

const searchQuery = ref('')
const candidates = ref([])
const columns = ref([])
const loading = ref(false)
const searched = ref(false)
const projectionState = ref('Not loaded')
const publication = ref(null)
const requestError = ref('')
const selectedHistorical = ref('')
let factEntries = [], editionRecords = [], factsRequest
let searchIndex, crossLinks, registryRights
const datasetCache = {}

async function readJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Public dataset unavailable')
  return response.json()
}
async function ensureFacts() {
  if (!factsRequest) factsRequest = (async () => {
    try {
      const [facts, editions] = await Promise.all([readJson('/data/comparison-facts.json'), readJson('/data/edition-diffs.json')])
      factEntries = readComparisonProjection(facts)
      editionRecords = readEditionProjection(editions)
      publication.value = facts
      projectionState.value = 'Authorized typed facts loaded.'
    } catch {
      factEntries = []; editionRecords = []; publication.value = null
      projectionState.value = 'Verified public test and limit facts are unavailable.'
    }
  })()
  return factsRequest
}
const historicalColumns = computed(() => columns.value.flatMap(column => {
  if (!column.facts) return []
  const pairs = editionsForEntry(editionRecords, { publisher: column.d, entryId: column.facts.entryId, edition: column.edition, substanceId: column.sub })
  return factEntries.filter(entry => entry.publisher === column.d && entry.substanceId === column.sub && entry.edition !== column.edition &&
    pairs.some(pair => pair.status === 'verified' && [pair.from, pair.to].some(endpoint => endpoint.entryId === entry.entryId && endpoint.edition === entry.edition)))
    .map(facts => ({ ...column, facts, edition: facts.edition, historical: true, key: `${column.key}:${facts.edition}` }))
}))
const historicalEditions = computed(() => [...new Set(historicalColumns.value.map(c => c.edition))])
const matrixColumns = computed(() => [...columns.value, ...historicalColumns.value.filter(c => c.edition === selectedHistorical.value)])
const comparisonRows = computed(() => comparisonMatrix(matrixColumns.value))
const comparisonStatus = computed(() => {
  if (loading.value) return 'Loading matches and comparison…'
  const messages = []
  if (candidates.value.length) messages.push(`${candidates.value.length} matching monographs.`)
  else if (searched.value && searchQuery.value.length >= 2) messages.push('No matching monographs.')
  if (columns.value.length) messages.push(`${columns.value.length} publisher entries displayed.`)
  if (selectedHistorical.value) messages.push(`Historical typed limits from ${selectedHistorical.value} included.`)
  return messages.join(' ') || 'Enter at least two characters to find a monograph.'
})
function selectHistorical() {
  const url = new URL(window.location.href)
  if (selectedHistorical.value) url.searchParams.set('edition', selectedHistorical.value)
  else url.searchParams.delete('edition')
  history.replaceState(null, '', url)
}
async function ensureIndex() {
  if (!searchIndex) searchIndex = await readJson('/data/search-index.json')
  if (!crossLinks) crossLinks = await readJson('/data/cross-links.json')
  if (!registryRights) registryRights = Object.fromEntries((await readJson('/data/registry.json')).map(ds => [ds.id, ds.rights]))
}
function candidateMatches(row, q) {
  return [row.t, row.n].filter(Boolean).join(' ').toLowerCase().includes(q)
}
async function searchMonographs() {
  const q = searchQuery.value.trim().toLowerCase()
  if (q.length < 2) { candidates.value = []; searched.value = false; return }
  loading.value = true; searched.value = true; requestError.value = ''
  try { await ensureIndex(); candidates.value = searchIndex.filter(r => candidateMatches(r, q)).slice(0, 20) }
  catch { requestError.value = 'Search data could not be loaded. Please try again.' }
  finally { loading.value = false }
}
async function datasetEntry(datasetId, slug, category) {
  if (!datasetCache[datasetId]) datasetCache[datasetId] = (await readJson(`/data/${datasetId}/${datasetId}-monographs.jsonld`))['@graph'] || []
  return resolveEntrySelection(datasetCache[datasetId], searchIndex, { publisher: datasetId, slug, category })
}
async function compareEntry(d, s, category, historicalEdition = '') {
  loading.value = true; requestError.value = ''; selectedHistorical.value = ''
  try {
    await Promise.all([ensureIndex(), ensureFacts()])
    const group = [{ d, s, c: category }, ...(crossLinks[`${d}/${s}`] || [])]
    const seen = new Set()
    const unique = group.filter(m => {
      const key = `${m.d}/${m.c || ''}/${m.s}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })
    columns.value = await Promise.all(unique.map(async m => {
      const selection = await datasetEntry(m.d, m.s, m.c)
      const entry = selection?.entry
      const types = Array.isArray(entry?.['@type']) ? entry['@type'] : [entry?.['@type']]
      const rights = types.includes('TitleIndexEntry') ? 'title-only' : registryRights[m.d]
      const access = detailAccess(m.d, rights)
      const restricted = access === 'title-only'
      const identity = { publisher: m.d, entryId: entry?.['@id'], edition: entry?.edition || '', substanceId: selection?.substanceId, rights }
      return {
        key: `${m.d}/${selection?.category || m.c || ''}/${m.s}`, d: m.d, s: m.s, c: selection?.category || m.c,
        restricted, access, resolved: !!selection, facts: findFacts(factEntries, identity), sub: selection?.substanceId || null,
        title: entry ? extractString(entry.prefLabel || entry['rdfs:label'] || {}) || m.s : m.t || m.s,
        edition: entry?.edition || '',
        definition: (!restricted && entry?.definition) ? extractString(entry.definition) : null,
        sections: (!restricted && entry?.sections) ? entry.sections.slice(0, 3) : []
      }
    }))
    if (historicalEditions.value.includes(historicalEdition)) selectedHistorical.value = historicalEdition
    const url = new URL('/compare', window.location.origin)
    url.searchParams.set('entry', `${d}/${s}`)
    if (category) url.searchParams.set('category', category)
    if (selectedHistorical.value) url.searchParams.set('edition', selectedHistorical.value)
    history.replaceState(null, '', url)
  } catch { columns.value = []; requestError.value = 'Comparison data could not be loaded. Please try again.' }
  finally { loading.value = false }
}
function onSelect(row) { compareEntry(row.d, row.s, row.c) }
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const entry = params.get('entry')
  if (entry && /^[a-z]+\/[^/]+$/.test(entry)) {
    const [d, s] = entry.split('/')
    searchQuery.value = s.replace(/-/g, ' ')
    compareEntry(d, s, params.get('category') || undefined, params.get('edition') || '')
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
      <label for="compare-query" class="mb-2 block text-sm font-medium text-ink">Find a monograph to compare</label>
      <input
        id="compare-query"
        v-model="searchQuery"
        @input="searchMonographs"
        type="text"
        placeholder="Enter substance name (e.g., paracetamol, aspirin)"
        class="w-full px-4 py-2 border border-line rounded-lg focus:ring-2 focus:ring-moss focus:border-moss"
      />
      <p role="status" aria-live="polite" aria-atomic="true" class="mt-3 text-sm text-ink/70">{{ comparisonStatus }}</p>
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

    <p v-if="requestError" role="alert" class="mt-4 text-oxblood">{{ requestError }}</p>

    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
    </div>

    <section v-if="columns.length && !loading" class="mb-8">
      <h2 class="font-display text-2xl font-semibold">Test limits and methods</h2>
      <p class="mt-2 text-sm">{{ projectionState }} Exact units and measurement bases are compared without conversion. Method citations do not establish interchangeability.</p>
      <div v-if="historicalEditions.length" class="mt-4">
        <label for="comparison-edition" class="block text-sm font-medium">Earlier edition for typed-limit comparison</label>
        <select id="comparison-edition" v-model="selectedHistorical" @change="selectHistorical" class="mt-2 max-w-full rounded border border-line bg-paper px-3 py-2">
          <option value="">Current editions only</option>
          <option v-for="edition in historicalEditions" :key="edition" :value="edition">{{ edition }}</option>
        </select>
        <p class="mt-2 text-sm">Historical columns contain the supplied typed facts only. Publisher cards retain their current edition text.</p>
      </div>
      <div v-if="comparisonRows.length" class="mt-4 overflow-x-auto" tabindex="0" role="region" aria-label="Publisher test comparison">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">Explicit public test limits by publisher and edition</caption>
          <thead><tr><th scope="col" class="border border-line p-3">Test</th><th v-for="col in matrixColumns" :key="col.key" scope="col" class="min-w-48 border border-line p-3">{{ col.d.toUpperCase() }} · {{ col.edition }}{{ col.historical ? ' (historical limits)' : '' }}</th></tr></thead>
          <tbody><tr v-for="row in comparisonRows" :key="row.semantic">
            <th scope="row" class="border border-line p-3">{{ row.label }}</th>
            <td v-for="cell in row.cells" :key="cell.column.key" class="align-top border border-line p-3">
              <template v-if="cell.test">
                <p class="font-mono">{{ formatLimit(cell.test) }}</p>
                <p>Basis: {{ cell.test.basis }}</p>
                <p>{{ cell.comparison.reason }}</p>
                <p v-if="cell.test.method">Method: {{ cell.test.method.publisher }} {{ cell.test.method.chapter }} — {{ cell.test.method.label }}</p>
                <p v-else>Method mapping unavailable.</p>
                <details class="mt-2"><summary>Evidence</summary><p>{{ cell.test.evidence }}</p><p v-if="cell.test.method">{{ cell.test.method.evidence }}</p></details>
              </template>
              <p v-else>{{ cell.column.access === 'title-only' ? 'Title only: limits and methods restricted.' : cell.column.access === 'held' ? 'New detailed comparisons held pending publication authority.' : cell.ambiguous ? 'Multiple test variants; comparison unavailable.' : 'Verified typed test unavailable.' }}</p>
            </td>
          </tr></tbody>
        </table>
      </div>
      <p v-else class="mt-3 text-sm">No authorized typed comparison is available for these entries.</p>
      <div v-if="publication" class="mt-4 space-y-2 text-sm">
        <p>{{ publication.attribution }}</p><p>{{ publication.adaptation }}</p><p>{{ publication.endorsement }}</p>
        <a :href="publication.license" class="underline">CC BY-NC-SA 3.0 IGO license</a>
      </div>
    </section>

    <div v-if="columns.length && !loading" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      <h2 class="sr-only">Publisher comparison</h2>
      <div v-for="col in columns" :key="col.key" class="bg-paper rounded-lg shadow-md p-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="badge" :class="'badge-' + col.d">{{ col.d.toUpperCase() }}</span>
          <span v-if="col.edition" class="text-xs text-ink/55">{{ col.edition }}</span>
          <a v-if="col.sub" :href="`/substance/${col.sub}`" class="ml-auto text-xs text-blue-700 hover:underline">substance →</a>
          <span v-if="col.restricted" class="ml-auto text-xs px-2 py-0.5 rounded bg-wash text-ink/55">title-only</span>
        </div>
        <h3 class="font-semibold text-ink">
          <a v-if="col.resolved" :href="`/pharmacopoeia/${col.d}/${col.c}/${col.s}`" class="hover:underline">
            {{ col.title }}
          </a>
          <span v-else>{{ col.title }}</span>
        </h3>
        <p v-if="!col.resolved" class="mt-2 text-sm">Entry category or identity is ambiguous; details unavailable.</p>
        <template v-else-if="!col.restricted">
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

    <div v-if="!columns.length && !loading" class="text-center py-12 text-ink/55">
      Search for a substance above, or open an entry and follow its counterpart links.
    </div>
  </div>
</template>
