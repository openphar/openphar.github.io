<script setup>
import { RouterLink } from 'vue-router'
import BrandMark from './BrandMark.vue'

const nav = [
  { to: '/search', label: 'Search' },
  { to: '/compare', label: 'Compare' },
  { to: '/ontology', label: 'Ontology' },
  { to: '/api', label: 'API' },
]
</script>

<template>
  <header class="border-b border-line bg-paper">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between py-4">
        <RouterLink to="/" class="group flex items-center gap-3">
          <BrandMark :size="34" />
          <span class="flex flex-col leading-none">
            <span class="font-display text-[1.35rem] font-semibold tracking-tight text-ink">
              Open&nbsp;Pharmacopoeia
            </span>
            <span class="font-mono text-[0.625rem] tracking-[0.18em] text-brass uppercase">
              one structure · every pharmacopoeia
            </span>
          </span>
        </RouterLink>

        <nav class="flex items-center gap-1 sm:gap-4" aria-label="Main">
          <RouterLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="font-mono text-xs tracking-[0.12em] uppercase text-ink/70 hover:text-pine px-2 py-1.5 rounded-sm transition-colors"
            active-class="text-pine border-b-2 border-brass"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
      </div>
    </div>
    <div class="h-[3px] bg-gradient-to-r from-pine via-moss to-brass"></div>
  </header>
</template>
