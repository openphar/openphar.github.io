<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useHead } from '@unhead/vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const doc = ref(null)
const missing = ref(false)
const historical = ref(null)
const publishers = ref({})

useHead({
  title: computed(() => (doc.value?.preferred_name?.en || doc.value?.id || 'Substance') + ' - Open Pharmacopoeia'),
  meta: [
    { name: 'description', content: 'All pharmacopoeia monographs for one substance identity: native names, CAS, salt/hydrate relations, and every publisher that monographs it.' }
  ]
})

let loadVersion = 0
async function loadSubstance() {
  const version = ++loadVersion
  const slug = route.params.slug
  doc.value = null
  historical.value = null
  missing.value = false
  const [reg, sub] = await Promise.all([
    fetch('/data/registry.json').then(r => r.json()).catch(() => []),
    fetch(`/data/substances/${slug}.json`).then(r => (r.ok ? r.json() : null))
  ])
  if (version !== loadVersion) return
  if (!sub) {
    const history = await fetch('/data/substance-history.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
    if (version !== loadVersion) return
    historical.value = history[slug] || null
    missing.value = !historical.value
    return
  }
  doc.value = sub
  for (const d of reg) publishers.value[d.id] = d
}
onMounted(loadSubstance)
watch(() => route.params.slug, loadSubstance)

const preferredTitle = computed(() =>
  doc.value?.preferred_name?.en || doc.value?.preferred_name?.inn ||
  doc.value?.entries?.[0]?.t || doc.value?.id)

const nativeNames = computed(() => {
  const names = doc.value?.names || {}
  const out = []
  for (const [lang, vals] of Object.entries(names)) {
    for (const v of [].concat(vals)) out.push({ lang, v })
  }
  return out
})

const langLabel = { ja: '日本語', ko: '한국어', zh: '中文', th: 'ไทย', la: 'Latin', iast: 'IAST', devanagari: 'Devanagari', inn: 'INN', 'zh-hans': '简体', 'zh-hant': '繁體' }

const casNumbers = computed(() => {
  const ids = doc.value?.identifiers || {}
  return [].concat(ids.cas_rn || ids.cas_rn_candidates || []).filter(Boolean)
})

const formRels = computed(() => (doc.value?.form_relations || []).map(r => ({
  ...r,
  direction: r.relation === 'salt-or-hydrate-of-this' ? 'salt / hydrate of this' : 'this is a salt / hydrate of'
})))
</script>

<template>
  <main class="max-w-5xl mx-auto px-4 py-10">
    <p v-if="missing" class="text-neutral-500">Substance not found in the registry.</p>

    <section v-else-if="historical">
      <h1 class="font-display text-3xl mb-4">Historical substance identity</h1>
      <p class="mb-4">This former identity has been withdrawn. Its source records do not establish one current shared identity.</p>
      <h2 class="font-semibold mb-2">Historical publisher records</h2>
      <ul>
        <li v-for="e in historical.entries" :key="e.d + '/' + e.c + '/' + e.s">
          <router-link :to="`/pharmacopoeia/${e.d}/${e.c}/${e.s}`">{{ e.t }} · {{ e.d }} · {{ e.edition }}</router-link>
        </li>
      </ul>
      <ul class="mt-4">
        <li v-for="iri in historical.source_iris" :key="iri"><a :href="iri">{{ iri }}</a></li>
      </ul>
    </section>

    <template v-else-if="doc">
      <p class="text-xs uppercase tracking-widest text-neutral-500 mb-2">Substance identity</p>
      <h1 class="font-display text-3xl md:text-4xl mb-1">{{ preferredTitle }}</h1>
      <p class="font-mono text-sm text-neutral-500 mb-6">{{ doc.iri }}</p>

      <div v-if="casNumbers.length" class="mb-4 flex flex-wrap gap-2">
        <span v-for="cas in casNumbers" :key="cas" class="font-mono text-sm bg-neutral-100 rounded px-2 py-0.5">CAS {{ cas }}</span>
      </div>

      <div v-if="nativeNames.length" class="mb-6 flex flex-wrap gap-x-6 gap-y-1">
        <span v-for="(n, i) in nativeNames" :key="i" class="text-sm">
          <span class="text-neutral-400 mr-1">{{ langLabel[n.lang] || n.lang }}</span>{{ n.v }}
        </span>
      </div>

      <div v-if="doc.synonyms?.length" class="mb-6">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-1">Synonyms</h2>
        <p class="text-sm text-neutral-700">{{ doc.synonyms.join(' · ') }}</p>
      </div>

      <div v-if="formRels.length" class="mb-8">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-2">Salt / hydrate forms</h2>
        <ul class="space-y-1">
          <li v-for="r in formRels" :key="r.slug" class="text-sm">
            <router-link :to="`/substance/${r.slug}`" class="text-blue-700 hover:underline font-medium">{{ r.slug }}</router-link>
            <span class="text-neutral-500 ml-2">({{ r.direction }})</span>
          </li>
        </ul>
      </div>

      <h2 class="text-lg font-semibold mb-3">Monographs across publishers</h2>
      <p v-if="!doc.entries.length" class="text-sm text-neutral-500">
        No monographs for this identity are in the public datasets yet — the
        underlying corpora are private source feeds; publishers appear here as
        their public release allows.
      </p>
      <ul v-else class="divide-y divide-neutral-200 border border-neutral-200 rounded">
        <li v-for="e in doc.entries" :key="e.d + '/' + e.c + '/' + e.s">
          <router-link :to="`/pharmacopoeia/${e.d}/${e.c}/${e.s}`" class="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-neutral-50">
            <span>
              <span class="font-medium">{{ e.t }}</span>
              <span v-if="publishers[e.d]" class="text-neutral-500 text-sm ml-2">{{ publishers[e.d].short || publishers[e.d].name }}</span>
              <span v-if="e.edition" class="text-neutral-400 text-sm ml-2">{{ e.edition }}</span>
            </span>
            <span v-if="e.k === 0" class="text-xs text-neutral-400 shrink-0">title only</span>
          </router-link>
        </li>
      </ul>

      <p v-if="doc.match_basis?.length" class="mt-8 text-xs text-neutral-400">
        identity evidence: {{ doc.match_basis.join(', ') }}
      </p>
    </template>
  </main>
</template>
