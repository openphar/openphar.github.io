<script setup>
import { ref, onMounted } from 'vue'
import { useHead } from '@unhead/vue'

useHead({
  title: 'Ontology Browser - Open Pharmacopoeia',
  meta: [
    { name: 'description', content: 'Browse and explore the Open Pharmacopoeia ontology' }
  ]
})

const ontologyFiles = ref([])
const selectedFile = ref(null)
const fileContent = ref(null)
const loading = ref(false)
const error = ref(null)

// List of ontology files to browse
const ontologyPaths = [
  { path: '/ontology/context/pharmacopoeia.jsonld', name: 'Pharmacopoeia Context', type: 'JSON-LD Context' },
  { path: '/ontology/core/pharmacopoeia.ttl', name: 'Core Ontology', type: 'Turtle' },
  { path: '/ontology/core/substance-form.ttl', name: 'Substance Form', type: 'Turtle' },
  { path: '/ontology/core/identification.ttl', name: 'Identification', type: 'Turtle' },
  { path: '/ontology/bibliographic/edition.ttl', name: 'Edition Ontology', type: 'Turtle' },
  { path: '/ontology/quality/test-method.ttl', name: 'Test Methods', type: 'Turtle' },
  { path: '/ontology/publisher/jp/extensions.ttl', name: 'JP Extensions', type: 'Turtle' },
  { path: '/ontology/publisher/phint/extensions.ttl', name: 'Ph.Int. Extensions', type: 'Turtle' }
]

async function loadFile(file) {
  loading.value = true
  error.value = null
  selectedFile.value = file

  try {
    const response = await fetch(file.path)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const text = await response.text()

    // Try to parse as JSON if it's a JSON-LD file
    if (file.path.endsWith('.jsonld')) {
      try {
        fileContent.value = JSON.parse(text)
      } catch {
        fileContent.value = text
      }
    } else {
      fileContent.value = text
    }
  } catch (e) {
    error.value = `Failed to load: ${e.message}`
    fileContent.value = null
  } finally {
    loading.value = false
  }
}

function formatContent(content) {
  if (typeof content === 'object') {
    return JSON.stringify(content, null, 2)
  }
  return content
}

onMounted(() => {
  ontologyFiles.value = ontologyPaths
})
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Ontology Browser</h1>

    <p class="text-gray-600 mb-6">
      Explore the Open Pharmacopoeia ontology files. These files define the vocabulary and structure
      for pharmacopoeia data in RDF/OWL format.
    </p>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- File List -->
      <div class="lg:col-span-1">
        <div class="bg-white rounded-xl shadow-md p-4">
          <h2 class="font-semibold text-gray-900 mb-4">Ontology Files</h2>
          <div class="space-y-2">
            <button
              v-for="file in ontologyFiles"
              :key="file.path"
              @click="loadFile(file)"
              class="w-full text-left px-4 py-3 rounded-lg transition-colors"
              :class="selectedFile?.path === file.path ? 'bg-primary-100 text-primary-800' : 'hover:bg-gray-100'"
            >
              <div class="font-medium">{{ file.name }}</div>
              <div class="text-sm text-gray-500">{{ file.type }}</div>
            </button>
          </div>
        </div>

        <!-- Quick Links -->
        <div class="bg-white rounded-xl shadow-md p-4 mt-4">
          <h2 class="font-semibold text-gray-900 mb-4">Resources</h2>
          <ul class="space-y-2 text-sm">
            <li>
              <a href="/data/jp/jp-monographs.jsonld" target="_blank" class="text-primary-600 hover:underline">
                JP Monographs (JSON-LD)
              </a>
            </li>
            <li>
              <a href="/data/jp/jp-monographs.ttl" target="_blank" class="text-primary-600 hover:underline">
                JP Monographs (Turtle)
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- File Content -->
      <div class="lg:col-span-2">
        <div class="bg-white rounded-xl shadow-md p-4 min-h-[600px]">
          <div v-if="!selectedFile" class="text-center py-12 text-gray-500">
            <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>Select a file from the list to view its contents</p>
          </div>

          <div v-else-if="loading" class="text-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p class="mt-4 text-gray-600">Loading...</p>
          </div>

          <div v-else-if="error" class="text-center py-12 text-red-600">
            <svg class="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p>{{ error }}</p>
          </div>

          <div v-else>
            <div class="flex justify-between items-center mb-4">
              <h2 class="font-semibold text-gray-900">{{ selectedFile.name }}</h2>
              <span class="text-sm text-gray-500">{{ selectedFile.type }}</span>
            </div>
            <pre class="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto text-sm max-h-[500px]">{{ formatContent(fileContent) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
