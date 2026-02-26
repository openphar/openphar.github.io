<script setup>
import { useHead } from '@unhead/vue'

useHead({
  title: 'API Documentation - Open Pharmacopoeia',
  meta: [
    { name: 'description', content: 'API documentation for accessing Open Pharmacopoeia data' }
  ]
})

const endpoints = [
  {
    method: 'GET',
    path: '/data/jp/jp-monographs.jsonld',
    description: 'Get all Japan Pharmacopoeia monographs',
    format: 'JSON-LD'
  },
  {
    method: 'GET',
    path: '/data/phint/phint-monographs.jsonld',
    description: 'Get all International Pharmacopoeia monographs',
    format: 'JSON-LD'
  },
  {
    method: 'GET',
    path: '/ontology/context/pharmacopoeia.jsonld',
    description: 'Get the JSON-LD context for pharmacopoeia data',
    format: 'JSON-LD'
  },
  {
    method: 'GET',
    path: '/data/edition/jp/jp18.jsonld',
    description: 'Get JP 18th edition metadata',
    format: 'JSON-LD'
  },
  {
    method: 'GET',
    path: '/data/edition/phint/phint13.jsonld',
    description: 'Get Ph.Int. 13th edition metadata',
    format: 'JSON-LD'
  }
]

const exampleResponse = `{
  "@context": "https://www.openphar.org/ontology/context/pharmacopoeia.jsonld",
  "@id": "https://www.openphar.org/data/jp/monographs/crude-drugs/ginseng",
  "@type": "CrudeDrugMonograph",
  "prefLabel": {
    "en": "Ginseng",
    "ja": "人参"
  },
  "publisher": { "@id": "https://www.openphar.org/ontology/publisher/JP" },
  "belongsToEdition": { "@id": "https://www.openphar.org/data/edition/jp/jp18" },
  "testSpecification": [
    {
      "@type": "TestSpecification",
      "testName": "Ginsenosides",
      "testType": "Assay",
      "limitType": "minimum",
      "limitValue": 0.20,
      "limitUnit": "%"
    }
  ]
}`
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">API Documentation</h1>

    <p class="text-gray-600 mb-8">
      Open Pharmacopoeia provides machine-readable data in JSON-LD and Turtle formats.
      All data is accessible via static file URLs.
    </p>

    <!-- Data Formats -->
    <section class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-4">Data Formats</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl shadow-md p-6">
          <h3 class="font-semibold text-gray-900 mb-2">JSON-LD</h3>
          <p class="text-gray-600 text-sm mb-3">
            Linked Data format optimized for web applications and semantic web tools.
          </p>
          <code class="text-sm bg-gray-100 px-2 py-1 rounded">.jsonld</code>
        </div>
        <div class="bg-white rounded-xl shadow-md p-6">
          <h3 class="font-semibold text-gray-900 mb-2">Turtle (TTL)</h3>
          <p class="text-gray-600 text-sm mb-3">
            Compact RDF format for triple stores and SPARQL endpoints.
          </p>
          <code class="text-sm bg-gray-100 px-2 py-1 rounded">.ttl</code>
        </div>
      </div>
    </section>

    <!-- Endpoints -->
    <section class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-4">Available Endpoints</h2>
      <div class="bg-white rounded-xl shadow-md overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Method</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Path</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="endpoint in endpoints" :key="endpoint.path">
              <td class="px-4 py-3">
                <span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">GET</span>
              </td>
              <td class="px-4 py-3">
                <code class="text-sm text-primary-600">{{ endpoint.path }}</code>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ endpoint.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Example -->
    <section class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-4">Example Response</h2>
      <div class="bg-gray-900 rounded-xl p-4 overflow-auto">
        <pre class="text-sm text-gray-100">{{ exampleResponse }}</pre>
      </div>
    </section>

    <!-- Ontology -->
    <section>
      <h2 class="text-xl font-semibold text-gray-900 mb-4">Ontology & Context</h2>
      <div class="bg-white rounded-xl shadow-md p-6">
        <p class="text-gray-600 mb-4">
          The Open Pharmacopoeia ontology defines the vocabulary for pharmacopoeia data.
        </p>
        <ul class="space-y-2">
          <li>
            <strong>JSON-LD Context:</strong>
            <code class="ml-2 text-sm bg-gray-100 px-2 py-1 rounded">/ontology/context/pharmacopoeia.jsonld</code>
          </li>
          <li>
            <strong>Core Ontology:</strong>
            <code class="ml-2 text-sm bg-gray-100 px-2 py-1 rounded">/ontology/core/pharmacopoeia.ttl</code>
          </li>
          <li>
            <strong>Test Methods:</strong>
            <code class="ml-2 text-sm bg-gray-100 px-2 py-1 rounded">/ontology/quality/test-method.ttl</code>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
