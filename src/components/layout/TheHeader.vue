<script setup>
import { RouterLink } from 'vue-router'

const publishers = [
  { id: 'jp', name: 'Japan Pharmacopoeia', color: 'bg-red-600' },
  { id: 'phint', name: 'International Pharmacopoeia', color: 'bg-blue-600' }
]
</script>

<template>
  <header class="bg-white shadow-sm border-b border-gray-200">
    <nav class="container mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <RouterLink to="/" class="flex items-center space-x-3">
          <div class="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <span class="text-xl font-bold text-gray-900">Open Pharmacopoeia</span>
        </RouterLink>

        <div class="flex items-center space-x-6">
          <RouterLink to="/search" class="text-gray-600 hover:text-gray-900 transition-colors">
            Search
          </RouterLink>
          <RouterLink to="/compare" class="text-gray-600 hover:text-gray-900 transition-colors">
            Compare
          </RouterLink>
          <RouterLink to="/ontology" class="text-gray-600 hover:text-gray-900 transition-colors">
            Ontology
          </RouterLink>
          <RouterLink to="/api" class="text-gray-600 hover:text-gray-900 transition-colors">
            API
          </RouterLink>
        </div>
      </div>
    </nav>
  </header>
</template>
