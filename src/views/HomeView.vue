<script setup>
import { ref, computed, onMounted } from 'vue'
import { useHead } from '@unhead/vue'
import { useRouter } from 'vue-router'
import { loadRegistry, rightsMeta, statusMeta } from '../lib/registry'
import BrandMark from '../components/BrandMark.vue'

useHead({
  title: 'Open Pharmacopoeia — one semantic structure for every pharmacopoeia',
  meta: [
    { name: 'description', content: 'A non-profit, open semantic structure for the world\'s pharmacopoeias: harmonized base layer from ICH Q4, extended by national, herbal and traditional pharmacopoeias. Search 23,000+ monographs across 12 datasets.' }
  ]
})

const router = useRouter()
const datasets = ref([])
const query = ref('')

onMounted(async () => {
  try {
    datasets.value = await loadRegistry()
  } catch (e) {
    console.error('Failed to load registry:', e)
  }
})

const totalEntries = computed(() => datasets.value.reduce((n, d) => n + (d.count || 0), 0))

function spineHeight(d) {
  const base = 88
  const scale = Math.min(72, Math.log10((d.count || 1) + 1) * 26)
  return Math.round(base + scale)
}

function spineClass(d) {
  if (d.status === 'raw') return 'spine-raw'
  if (d.status === 'reference') return 'spine-ref'
  if (d.rights === 'title-only') return 'spine-restricted'
  return 'spine-full'
}

function spineTarget(d) {
  return d.status === 'raw' ? null : `/pharmacopoeia/${d.id}`
}

function submit() {
  if (query.value.trim()) router.push({ path: '/search', query: { q: query.value.trim() } })
}
</script>

<template>
  <div>
    <!-- Hero + registry wall -->
    <section class="relative overflow-hidden bg-pine text-paper">
      <div class="container mx-auto px-4 pt-14 pb-0">
        <div class="max-w-3xl">
          <p class="eyebrow !text-brasslight">An open, non-profit infrastructure project</p>
          <h1 class="mt-4 font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            The world's pharmacopoeias,<br>
            <span class="italic text-brasslight">one semantic structure.</span>
          </h1>
          <p class="mt-6 max-w-2xl text-base leading-relaxed text-paper/80 sm:text-lg">
            A harmonized base layer anchored on ICH&nbsp;Q4, extended by national and
            traditional pharmacopoeias — Japanese, Chinese, Korean, Indian, Thai,
            International and more — as one linked, machine-readable graph.
          </p>

          <form class="mt-8 flex max-w-xl" role="search" @submit.prevent="submit">
            <label for="home-search" class="sr-only">Search monographs</label>
            <input
              id="home-search"
              v-model="query"
              type="search"
              placeholder="Search 23,000+ monographs — e.g. paracetamol, Ginseng Radix, 乙醇…"
              class="w-full rounded-l-sm border-0 bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-brass"
            >
            <button
              type="submit"
              class="rounded-r-sm bg-brass px-5 py-3 font-mono text-xs uppercase tracking-[0.12em] text-pine transition-colors hover:bg-brasslight"
            >
              Search
            </button>
          </form>
        </div>

        <!-- The registry wall: every dataset as a spine on the shelf -->
        <div class="mt-12">
          <div class="flex items-end gap-1.5 overflow-x-auto pb-0 sm:gap-2" aria-label="Datasets">
            <component
              :is="spineTarget(d) ? 'router-link' : 'div'"
              v-for="d in datasets"
              :key="d.id"
              :to="spineTarget(d)"
              :class="['spine group relative flex-shrink-0 cursor-pointer rounded-t-sm transition-transform duration-200 hover:-translate-y-1.5', spineClass(d)]"
              :style="{ height: spineHeight(d) + 'px', width: '46px' }"
              :aria-label="`${d.name} (${d.count} entries)`"
            >
              <span class="flex h-full flex-col items-center justify-between py-2.5">
                <span class="font-mono text-[10px] font-medium tracking-wider">{{ d.short }}</span>
                <span class="font-mono text-[9px] opacity-70">{{ d.count > 0 ? d.count.toLocaleString() : '—' }}</span>
              </span>
              <span
                class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 font-mono text-[10px] text-paper group-hover:block"
              >
                {{ d.name }} · {{ rightsMeta(d.rights).label }}
              </span>
            </component>
          </div>
          <div class="h-[5px] bg-brass"></div>
          <p class="py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-paper/50">
            The registry — green spines: full text · red spines: index only (USP, Ph.&nbsp;Eur., BP) · outlined: extraction in progress
          </p>
        </div>
      </div>
    </section>

    <!-- Stats strip -->
    <section class="border-b border-line bg-wash">
      <div class="container mx-auto grid grid-cols-2 divide-line px-4 py-8 sm:grid-cols-4 sm:divide-x">
        <div class="px-2 py-3 sm:px-6">
          <div class="font-mono text-3xl font-medium text-pine">{{ datasets.length }}</div>
          <div class="mt-1 text-xs uppercase tracking-[0.12em] text-ink/60">Datasets</div>
        </div>
        <div class="px-2 py-3 sm:px-6">
          <div class="font-mono text-3xl font-medium text-pine">{{ totalEntries.toLocaleString() }}+</div>
          <div class="mt-1 text-xs uppercase tracking-[0.12em] text-ink/60">Indexed entries</div>
        </div>
        <div class="px-2 py-3 sm:px-6">
          <div class="font-mono text-3xl font-medium text-pine">1</div>
          <div class="mt-1 text-xs uppercase tracking-[0.12em] text-ink/60">Harmonized core (ICH&nbsp;Q4)</div>
        </div>
        <div class="px-2 py-3 sm:px-6">
          <div class="font-mono text-3xl font-medium text-pine">100%</div>
          <div class="mt-1 text-xs uppercase tracking-[0.12em] text-ink/60">Open, machine-readable data</div>
        </div>
      </div>
    </section>

    <!-- Dataset registry -->
    <section id="registry" class="container mx-auto px-4 py-14">
      <p class="eyebrow">The registry</p>
      <h2 class="mt-2 font-display text-3xl font-semibold tracking-tight">Every dataset, declared explicitly</h2>
      <p class="mt-3 max-w-2xl text-sm leading-relaxed text-ink/70">
        What we publish — and what we may only index — is declared per dataset, not
        assumed. Copyrighted pharmacopoeias (USP, Ph.&nbsp;Eur., BP) appear as title
        indexes linked to their harmonized counterparts, never as content.
      </p>

      <div class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="d in datasets"
          :key="d.id"
          :to="`/pharmacopoeia/${d.id}`"
          class="group flex flex-col rounded-sm border bg-paper p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
          :class="d.rights === 'title-only' ? 'border-oxblood/40' : d.status === 'raw' ? 'border-dashed border-line' : 'border-line'"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="font-display text-2xl font-semibold text-pine">{{ d.short }}</span>
            <span
              class="rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
              :class="d.rights === 'title-only' ? 'bg-oxblood/10 text-oxblood' : d.status === 'raw' ? 'bg-brass/10 text-brass' : 'bg-pine/10 text-pine'"
            >
              {{ d.rights === 'title-only' ? 'Index only' : d.status === 'raw' ? 'In extraction' : 'Full text' }}
            </span>
          </div>
          <h3 class="mt-1.5 text-sm font-medium text-ink">{{ d.name }}</h3>
          <p class="mt-0.5 text-xs text-ink/60">
            {{ d.organization }} · {{ d.country }}
            <span v-if="d.nativeName" class="ml-1">{{ d.nativeName }}</span>
          </p>
          <div class="mt-auto flex items-center justify-between border-t border-line pt-3 pt-3 mt-4 text-xs">
            <span class="font-mono text-ink/60">{{ d.count > 0 ? d.count.toLocaleString() + ' entries' : statusMeta(d.status).label }}</span>
            <span class="font-mono text-[10px] uppercase tracking-wider text-pine opacity-0 transition-opacity group-hover:opacity-100">
              Browse →
            </span>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- The layered model -->
    <section class="border-t border-line bg-paperdeep">
      <div class="container mx-auto grid grid-cols-1 gap-10 px-4 py-14 lg:grid-cols-2">
        <div>
          <p class="eyebrow">The model</p>
          <h2 class="mt-2 font-display text-3xl font-semibold tracking-tight">
            A base layer, then every tradition on its own terms
          </h2>
          <p class="mt-4 text-sm leading-relaxed text-ink/75">
            The core ontology defines what every pharmacopoeia shares — substances,
            monographs, test specifications, units — harmonized where ICH&nbsp;Q4
            has done the work. Each pharmacopoeia then extends the core with its own
            layer: crude-drug descriptions for herbal traditions, bilingual labels,
            national editions. Nothing is forced into one mold; everything links.
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <RouterLink
              to="/ontology"
              class="rounded-sm bg-pine px-4 py-2.5 font-mono text-xs uppercase tracking-[0.12em] text-paper transition-colors hover:bg-moss"
            >
              Explore the ontology
            </RouterLink>
            <RouterLink
              to="/compare"
              class="rounded-sm border border-pine px-4 py-2.5 font-mono text-xs uppercase tracking-[0.12em] text-pine transition-colors hover:bg-wash"
            >
              Compare across publishers
            </RouterLink>
          </div>
        </div>

        <div class="flex flex-col justify-center gap-2" aria-hidden="true">
          <div class="rounded-sm border-2 border-brass bg-paper px-5 py-4">
            <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-brass">Base layer — harmonized</p>
            <p class="latin mt-1 text-lg">Substance · Monograph · TestSpecification · Unit</p>
            <p class="text-xs text-ink/60">ICH Q4B harmonized methods — shared by all</p>
          </div>
          <div class="flex justify-center font-mono text-xs text-ink/40">↑ extends</div>
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-sm border border-moss bg-paper px-3 py-3 text-center">
              <p class="font-display text-lg font-semibold text-pine">JP</p>
              <p class="font-mono text-[9px] text-ink/60">crude drugs · bilingual</p>
            </div>
            <div class="rounded-sm border border-moss bg-paper px-3 py-3 text-center">
              <p class="font-display text-lg font-semibold text-pine">ChP</p>
              <p class="font-mono text-[9px] text-ink/60">中医药 · 2025</p>
            </div>
            <div class="rounded-sm border border-moss bg-paper px-3 py-3 text-center">
              <p class="font-display text-lg font-semibold text-pine">API</p>
              <p class="font-mono text-[9px] text-ink/60">ayurvedic · sanskrit</p>
            </div>
          </div>
          <p class="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink/40">
            … one layer per pharmacopoeia, kind and procedure
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.spine-full {
  background: linear-gradient(180deg, #16493d 0%, #0f3d33 100%);
  color: #f3f4ee;
  box-shadow: inset 3px 0 0 rgba(216, 192, 138, 0.35);
}
.spine-restricted {
  background: linear-gradient(180deg, #93413a 0%, #8f3b32 100%);
  color: #f3f4ee;
  box-shadow: inset 3px 0 0 rgba(216, 192, 138, 0.3);
}
.spine-raw {
  background: #f3f4ee;
  color: rgba(22, 36, 31, 0.55);
  border: 1.5px dashed #c9cfc5;
  border-bottom: none;
}
.spine-ref {
  background: linear-gradient(180deg, #b8934a 0%, #b08a3e 100%);
  color: #16241f;
}
</style>
