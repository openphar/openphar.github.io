<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useHead } from '@unhead/vue'
import { useRoute } from 'vue-router'
import { useSearch } from '../composables/useSearch'
import { loadRegistry, rightsMeta } from '../lib/registry'

useHead({
  title: 'Search — Open Pharmacopoeia',
  meta: [{ name: 'description', content: 'Search monographs across every pharmacopoeia in the registry — open datasets in full, copyrighted ones by title index.' }]
})

const route = useRoute()
const { loading, initialized, initialize, search, getStats } = useSearch()

const registry = ref([])
const query = ref('')
const selectedDataset = ref('')
const restrictedOnly = ref(false)
const results = ref([])
const total = ref(0)

const datasetOptions = computed(() => registry.value.map(d => ({ id: d.id, label: `${d.short} — ${d.name}` })))

onMounted(async () => {
  await initialize()
  try { registry.value = await loadRegistry() } catch { /* registry optional here */ }
  const q = route.query.q
  if (q) {
    query.value = String(q)
    runSearch()
  } else {
    total.value = getStats().total
  }
})

let timer = null
watch([query, selectedDataset, restrictedOnly], () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(runSearch, 250)
})

function runSearch() {
  if (!initialized.value) return
  if (query.value.trim().length >= 2) {
    results.value = search(query.value.trim(), {
      dataset: selectedDataset.value || undefined,
      restricted: restrictedOnly.value ? true : undefined,
      limit: 120
    })
  } else {
    results.value = []
  }
  total.value = getStats().total
}

function datasetMeta(id) {
  return registry.value.find(d => d.id === id)
}

function isRestricted(r) {
  return r.k === 0
}
</script>

<template>
  <div class="container mx-auto px-4 py-10">
    <p class="eyebrow">Global search</p>
    <h1 class="mt-2 font-display text-4xl font-semibold tracking-tight">Every monograph, one query</h1>
    <p class="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
      {{ total.toLocaleString() }} indexed entries across {{ registry.length }} datasets.
      Green results open the full text here; red results are index entries for
      copyrighted pharmacopoeias (USP, Ph.&nbsp;Eur., BP).
    </p>

    <div class="mt-7 flex flex-col gap-3 lg:flex-row">
      <input
        v-model="query"
        type="search"
        placeholder="e.g. paracetamol, ginseng, 아세틸시스테인…"
        class="w-full rounded-sm border border-line bg-paper px-4 py-3 text-base focus:border-moss focus:outline-none focus:ring-1 focus:ring-moss"
        autofocus
      >
      <select
        v-model="selectedDataset"
        class="rounded-sm border border-line bg-paper px-4 py-3 text-sm focus:border-moss lg:w-64"
      >
        <option value="">All datasets</option>
        <option v-for="d in datasetOptions" :key="d.id" :value="d.id">{{ d.label }}</option>
      </select>
      <label class="flex items-center gap-2 rounded-sm border border-line bg-paper px-4 py-3 text-sm text-ink/75 lg:w-56">
        <input v-model="restrictedOnly" type="checkbox" class="accent-oxblood">
        Index-only entries
      </label>
    </div>

    <div v-if="loading" class="py-16 text-center">
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-line border-t-pine"></div>
      <p class="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-ink/50">Loading index…</p>
    </div>

    <template v-else>
      <p class="mt-6 font-mono text-xs text-ink/55">
        {{ query.length >= 2 ? `${results.length} result${results.length === 1 ? '' : 's'}` : `${total.toLocaleString()} entries indexed — start typing to search` }}
      </p>

      <ul v-if="results.length" class="mt-4 divide-y divide-line border-y border-line">
        <li v-for="r in results" :key="r.d + '/' + r.s">
          <RouterLink
            :to="`/pharmacopoeia/${r.d}/${r.c}/${r.s}`"
            class="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5 transition-colors hover:bg-wash/60"
          >
            <span class="flex min-w-0 items-baseline gap-3">
              <span
                class="flex-shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                :class="isRestricted(r) ? 'bg-oxblood/10 text-oxblood' : 'bg-pine/10 text-pine'"
              >
                {{ datasetMeta(r.d)?.short || r.d }}
              </span>
              <span class="truncate text-[0.95rem] font-medium text-ink group-hover:text-pine">{{ r.t }}</span>
            </span>
            <span class="font-mono text-[10px] uppercase tracking-wider text-ink/45">
              {{ isRestricted(r) ? 'index only' : r.c }}
            </span>
          </RouterLink>
        </li>
      </ul>

      <div v-else-if="query.length >= 2" class="py-14 text-center">
        <p class="latin text-2xl text-ink/25">nihil inventum</p>
        <p class="mt-2 text-sm text-ink/60">No entries match "{{ query }}". Try a substance name, INN, or Latin title.</p>
      </div>
    </template>
  </div>
</template>
