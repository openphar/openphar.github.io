<script setup>
import { ref, computed } from 'vue'
import { extractString, primaryLang, labelPairs } from '../lib/i18n'
import { detailAccess } from '../lib/comparison-contract.js'
import { methodCatalogDisplay } from '../lib/method-catalog-display.js'

const props = defineProps({ publisher: String, category: String, slug: String, initialMonograph: Object, initialMeta: Object, initialRegistry: Array, initialCounterparts: Array, initialTitleEditions: Array })
const publisher = computed(() => props.publisher)
const category = computed(() => props.category)
const slug = computed(() => props.slug)

const monograph = ref(props.initialMonograph)
const meta = ref(props.initialMeta)
const loading = ref(false)
const error = ref(null)


function shortOf(id) {
  return registryList.value.find(d => d.id === id)?.short || id.toUpperCase()
}

function extractArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const entryLang = computed(() => {
  const labels = monograph.value?.prefLabel
  if (labels && typeof labels === 'object') {
    const key = primaryLang(labels)
    if (key) return key
  }
  return Object.keys(monograph.value?.definition || {})[0] || 'en'
})


const isRestricted = computed(() => {
  if (detailAccess(publisher.value, meta.value?.rights) === 'title-only') return true
  const t = monograph.value?.['@type']
  return Array.isArray(t) ? t.includes('TitleIndexEntry') : t === 'TitleIndexEntry'
})

const registryList = ref(props.initialRegistry || [])
const counterparts = ref(props.initialCounterparts || [])

const allLabels = computed(() => labelPairs(monograph.value?.prefLabel || {}))

const catalogDisplay = computed(() => methodCatalogDisplay(publisher.value, category.value, monograph.value))
const sections = computed(() => catalogDisplay.value.sections)
const testSpecifications = computed(() => extractArray(monograph.value?.testSpecification))
const assaySpecs = computed(() => extractArray(monograph.value?.assay))
const publisherName = computed(() => meta.value?.name || publisher.value)

</script>

<template>
  <div class="container mx-auto max-w-4xl px-4 py-10">
    <div v-if="loading" class="py-16 text-center">
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-line border-t-pine"></div>
      <p class="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-ink/50">Loading…</p>
    </div>

    <div v-else-if="error" class="py-16 text-center">
      <p class="latin text-3xl text-ink/30">non inventum</p>
      <h2 class="mt-3 font-display text-xl font-semibold">{{ error }}</h2>
      <a :href="`/pharmacopoeia/${publisher}`" class="mt-4 inline-block font-mono text-xs uppercase tracking-[0.12em] text-pine underline decoration-brass underline-offset-4">
        ← Back to {{ meta?.short || publisher }}
      </a>
    </div>

    <article v-else-if="monograph">
      <!-- Breadcrumb -->
      <nav class="mb-6 font-mono text-[11px] uppercase tracking-[0.1em]" aria-label="Breadcrumb">
        <ol class="flex flex-wrap items-center gap-1.5 text-ink/50">
          <li><a href="/" class="hover:text-pine">Home</a></li>
          <li aria-hidden="true">/</li>
          <li><a :href="`/pharmacopoeia/${publisher}`" class="hover:text-pine">{{ meta?.short || publisher }}</a></li>
          <li aria-hidden="true">/</li>
          <li class="text-ink/70">{{ category }}</li>
        </ol>
      </nav>

      <!-- Restricted title-only entry -->
      <div v-if="isRestricted" class="rounded-xs border border-oxblood/35 bg-oxblood/[0.04]">
        <div class="h-[4px] bg-oxblood"></div>
        <div class="p-6 sm:p-8">
          <p class="eyebrow !text-oxblood">Index entry — content restricted</p>
          <h1 class="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {{ extractString(monograph.prefLabel) }}
          </h1>
          <p v-if="allLabels.length > 1" class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-lg text-ink/60">
            <span v-for="[lang, val] in allLabels.slice(1)" :key="lang" :lang="lang">{{ val }}</span>
          </p>
          <dl class="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wider text-ink/50">Pharmacopoeia</dt>
              <dd class="mt-1">{{ publisherName }}</dd>
            </div>
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wider text-ink/50">Edition</dt>
              <dd class="mt-1 font-mono">{{ monograph.edition || meta?.edition }}</dd>
            </div>
            <div>
              <dt class="font-mono text-[10px] uppercase tracking-wider text-ink/50">Category</dt>
              <dd class="mt-1 font-mono">{{ monograph.category || category }}</dd>
            </div>
          </dl>
          <div class="mt-6 border-t border-oxblood/20 pt-5 text-sm leading-relaxed text-ink/75">
            <p>
              The full text of this monograph is copyrighted and is not published here.
              {{ meta?.restriction?.notice }}
            </p>
            <div class="mt-4 flex flex-wrap gap-3">
              <a
                v-if="meta?.restriction?.url"
                :href="meta.restriction.url"
                class="rounded-xs bg-oxblood px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper hover:opacity-90"
              >
                Official source ↗
              </a>
            </div>
            <details v-if="initialTitleEditions?.length" class="mt-5">
              <summary class="cursor-pointer font-medium">Available USP editions (title metadata only)</summary>
              <p class="mt-2">Detailed edition changes are restricted. These links select title and edition metadata in Compare.</p>
              <ul class="mt-3 space-y-2">
                <li v-for="record in initialTitleEditions" :key="record['@id']">
                  <a :href="`/compare?entry=${encodeURIComponent(publisher + '/' + slug)}&category=${encodeURIComponent(category)}&uspEdition=${encodeURIComponent(record.edition)}`" class="underline">{{ record.prefLabel.en }} · {{ record.edition }}</a>
                </li>
              </ul>
            </details>
            <ul v-if="counterparts.length" class="mt-5 flex flex-wrap gap-2">
              <li v-for="c in counterparts" :key="c.d + c.s">
                <a
                  :href="`/pharmacopoeia/${c.d}/${c.c}/${c.s}`"
                  class="flex items-center gap-2 rounded-xs border border-moss/40 bg-paper px-3 py-1.5 text-sm transition-colors hover:border-pine"
                >
                  <span class="font-mono text-[9px] uppercase tracking-wider text-pine">{{ shortOf(c.d) }}</span>
                  <span class="text-ink/85">{{ c.t }}</span>
                </a>
              </li>
            </ul>
            <p class="mt-4 font-mono text-[10px] uppercase tracking-wider text-ink/45">
              Linked via cross-publisher identity and ICH Q4 harmonized methods
            </p>
          </div>
        </div>
      </div>

      <!-- Open monograph entry -->
      <div v-else class="rounded-xs border border-line bg-paper">
        <div class="h-[4px] bg-gradient-to-r from-pine via-moss to-brass"></div>
        <div class="p-6 sm:p-10">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="eyebrow">{{ publisherName }} · {{ monograph.edition || meta?.edition }}</p>
              <h1 class="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {{ extractString(monograph.prefLabel || monograph['rdfs:label']) }}
              </h1>
              <p v-if="allLabels.length > 1" class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-lg text-ink/60">
                <span v-for="[lang, val] in allLabels.slice(1)" :key="lang" :lang="lang">{{ val }}</span>
              </p>
              <p v-if="monograph.monographId" class="mt-2 font-mono text-xs text-ink/50">{{ monograph.monographId }}</p>
            </div>
            <span class="flex-shrink-0 rounded-xs bg-pine/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-pine">
              {{ meta?.short || publisher.toUpperCase() }}
            </span>
          </div>

          <dl v-if="monograph.molecularFormula || monograph.casNumber || monograph.molecularWeight" class="mt-6 grid grid-cols-2 gap-4 border-y border-line py-4 sm:grid-cols-4">
            <div v-if="monograph.molecularFormula">
              <dt class="font-mono text-[10px] uppercase tracking-wider text-ink/50">Formula</dt>
              <dd class="mt-0.5 font-mono text-sm">{{ monograph.molecularFormula }}</dd>
            </div>
            <div v-if="monograph.casNumber">
              <dt class="font-mono text-[10px] uppercase tracking-wider text-ink/50">CAS</dt>
              <dd class="mt-0.5 font-mono text-sm">{{ monograph.casNumber }}</dd>
            </div>
            <div v-if="monograph.molecularWeight">
              <dt class="font-mono text-[10px] uppercase tracking-wider text-ink/50">M<sub>w</sub></dt>
              <dd class="mt-0.5 font-mono text-sm">{{ monograph.molecularWeight }}</dd>
            </div>
            <div v-if="monograph.version">
              <dt class="font-mono text-[10px] uppercase tracking-wider text-ink/50">Version</dt>
              <dd class="mt-0.5 font-mono text-sm">{{ monograph.version }}</dd>
            </div>
          </dl>

          <div v-if="monograph.harmonisationStatus || monograph.ichAnnex" class="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider">
            <span v-if="monograph.ichAnnex" class="rounded-xs bg-pine/10 px-2 py-1 text-pine">{{ monograph.ichAnnex }}</span>
            <span v-if="monograph.harmonisationStatus" class="rounded-xs bg-brass/15 px-2 py-1 text-brass">{{ (monograph.catalogProvenance?.kind === 'method-family-association' || (publisher === 'ich' && category === 'methods')) ? 'Catalog status' : 'ICH Q4B' }} · {{ monograph.harmonisationStatus }}</span>
          </div>

          <section v-if="catalogDisplay.definition" class="mt-6">
            <h2 class="eyebrow">{{ catalogDisplay.legacy ? 'Catalog entry' : 'Definition' }}</h2>
            <p class="mt-2 text-[0.95rem] leading-relaxed text-ink/85">{{ extractString(catalogDisplay.definition) }}</p>
          </section>

          <section v-if="extractString(monograph.appearance)" class="mt-6">
            <h2 class="eyebrow">Appearance</h2>
            <p class="mt-2 text-[0.95rem] leading-relaxed text-ink/85">{{ extractString(monograph.appearance) }}</p>
          </section>

          <section v-if="sections.length" class="mt-6">
            <h2 class="eyebrow">{{ publisher === 'ich' && category === 'methods' ? 'Chapter associations' : 'Monograph text' }}</h2>
            <div class="mt-3 space-y-5">
              <div v-for="(s, i) in sections" :key="i">
                <h3 class="font-mono text-[11px] uppercase tracking-[0.12em] text-moss">{{ s.name }}</h3>
                <p class="mt-1 whitespace-pre-line text-[0.925rem] leading-relaxed text-ink/80">{{ s.text }}</p>
              </div>
            </div>
          </section>

          <section v-if="testSpecifications.length" class="mt-6">
            <h2 class="eyebrow">Test specifications</h2>
            <div class="mt-3 space-y-3">
              <div v-for="(spec, i) in testSpecifications" :key="i" class="border-l-2 border-brass/50 pl-4">
                <h3 class="text-sm font-medium text-ink">{{ extractString(spec.testName) }}</h3>
                <p v-if="extractString(spec.testType)" class="font-mono text-xs text-ink/55">{{ extractString(spec.testType) }}</p>
                <p v-if="extractString(spec.testConditions)" class="mt-1 text-sm leading-relaxed text-ink/75">{{ extractString(spec.testConditions) }}</p>
              </div>
            </div>
          </section>

          <section v-if="assaySpecs.length" class="mt-6">
            <h2 class="eyebrow">Assay</h2>
            <dl class="mt-3 space-y-2 text-sm">
              <div v-for="(a, i) in assaySpecs" :key="i" class="flex flex-wrap gap-x-8 gap-y-1">
                <div v-if="extractString(a.assayTarget)">
                  <dt class="inline font-mono text-[10px] uppercase text-ink/50">Target </dt>
                  <dd class="inline text-ink/85">{{ extractString(a.assayTarget) }}</dd>
                </div>
                <div v-if="a.limitValue">
                  <dt class="inline font-mono text-[10px] uppercase text-ink/50">Limit </dt>
                  <dd class="inline font-mono text-ink/85">{{ a.limitType }} {{ a.limitValue }} {{ a.limitUnit || '' }}</dd>
                </div>
              </div>
            </dl>
          </section>

          <section v-if="counterparts.length" class="mt-8 border-t border-line pt-6" aria-label="Counterparts in other pharmacopoeias">
            <p class="eyebrow">Same substance in other pharmacopoeias</p>
            <ul class="mt-3 flex flex-wrap gap-2">
              <li v-for="c in counterparts" :key="c.d + c.s">
                <a
                  :href="`/pharmacopoeia/${c.d}/${c.c}/${c.s}`"
                  class="flex items-center gap-2 rounded-xs border px-3 py-1.5 text-sm transition-colors"
                  :class="c.k === 0
                    ? 'border-oxblood/40 bg-oxblood/[0.05] hover:border-oxblood'
                    : 'border-line bg-paper hover:border-moss'"
                >
                  <span class="font-mono text-[9px] uppercase tracking-wider" :class="c.k === 0 ? 'text-oxblood' : 'text-pine'">{{ shortOf(c.d) }}</span>
                  <span class="text-ink/85">{{ c.t }}</span>
                  <span v-if="c.k === 0" class="font-mono text-[9px] uppercase tracking-wider text-oxblood/70">index</span>
                </a>
              </li>
            </ul>
          </section>

          <p v-else class="mt-8 border-t border-line pt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink/40">
            No counterparts indexed yet —
            <a :href="`/search?q=${encodeURIComponent(extractString(monograph.prefLabel))}`" class="text-pine underline decoration-brass/60 underline-offset-4">
              search this title across all datasets
            </a>
          </p>

          <details v-if="!catalogDisplay.legacy" class="mt-8 border-t border-line pt-5">
            <summary class="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-ink/60 hover:text-pine">View raw JSON-LD</summary>
            <pre class="mt-3 max-h-96 overflow-auto rounded-xs bg-ink/[0.04] p-4 font-mono text-xs text-ink/80">{{ JSON.stringify(monograph, null, 2) }}</pre>
          </details>
        </div>
      </div>
    </article>
  </div>
</template>
