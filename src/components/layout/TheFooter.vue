<script setup>
import { RouterLink } from 'vue-router'
import BrandMark from './BrandMark.vue'
import { loadRegistry } from '../../lib/registry'
import { ref, onMounted } from 'vue'

const datasets = ref([])
onMounted(async () => {
  try {
    datasets.value = (await loadRegistry()).filter(d => d.status !== 'reference').slice(0, 6)
  } catch { /* footer degrades to static links */ }
})
</script>

<template>
  <footer class="mt-auto bg-pine text-paper">
    <div class="h-[3px] bg-gradient-to-r from-brass via-moss to-pine"></div>
    <div class="container mx-auto px-4 py-10">
      <div class="grid grid-cols-1 gap-10 md:grid-cols-12">
        <div class="md:col-span-5">
          <div class="flex items-center gap-3">
            <BrandMark :size="30" />
            <span class="font-display text-lg font-semibold">Open Pharmacopoeia</span>
          </div>
          <p class="mt-4 max-w-sm text-sm leading-relaxed text-paper/75">
            A non-profit building one open, semantic structure for the world's
            pharmacopoeias — a harmonized base layer anchored on ICH&nbsp;Q4,
            extended by every national and traditional pharmacopoeia.
          </p>
        </div>

        <div class="md:col-span-3">
          <p class="eyebrow !text-brasslight mb-3">Datasets</p>
          <ul class="space-y-1.5 text-sm text-paper/80">
            <li v-for="d in datasets" :key="d.id">
              <RouterLink :to="`/pharmacopoeia/${d.id}`" class="hover:text-brasslight">
                {{ d.short }} — {{ d.name }}
              </RouterLink>
            </li>
          </ul>
        </div>

        <div class="md:col-span-2">
          <p class="eyebrow !text-brasslight mb-3">Site</p>
          <ul class="space-y-1.5 text-sm text-paper/80">
            <li><RouterLink to="/search" class="hover:text-brasslight">Search</RouterLink></li>
            <li><RouterLink to="/compare" class="hover:text-brasslight">Compare</RouterLink></li>
            <li><RouterLink to="/ontology" class="hover:text-brasslight">Ontology</RouterLink></li>
            <li><RouterLink to="/api" class="hover:text-brasslight">API</RouterLink></li>
          </ul>
        </div>

        <div class="md:col-span-2">
          <p class="eyebrow !text-brasslight mb-3">Project</p>
          <ul class="space-y-1.5 text-sm text-paper/80">
            <li><a href="https://github.com/openphar" class="hover:text-brasslight">GitHub org</a></li>
            <li><a href="https://github.com/openphar/openphar.github.io/tree/main/TODO.deploy" class="hover:text-brasslight">Deployment program</a></li>
          </ul>
        </div>
      </div>

      <div class="mt-10 flex flex-col gap-2 border-t border-paper/20 pt-5 text-xs text-paper/60 sm:flex-row sm:items-center sm:justify-between">
        <span>© {{ new Date().getFullYear() }} Open Pharmacopoeia — open data, harmonized standards.</span>
        <span class="font-mono">www.openphar.org</span>
      </div>
    </div>
  </footer>
</template>
