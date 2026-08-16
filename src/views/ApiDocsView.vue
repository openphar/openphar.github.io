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
    path: '/data/registry.json',
    description: 'Machine-readable dataset registry — every dataset, its rights, edition and entry count',
    format: 'JSON'
  },
  {
    method: 'GET',
    path: '/data/search-index.json',
    description: 'Slim cross-dataset title index (all datasets, titles only)',
    format: 'JSON'
  },
  {
    method: 'GET',
    path: '/data/{dataset}/{dataset}-monographs.jsonld',
    description: 'Per-dataset entry graph — jp, phint (full monographs); thp, chp, ip, ayp, hk (indexed monographs); us, eu, uk (title index only, copyrighted)',
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
    path: '/ontology/core/pharmacopoeia.ttl',
    description: 'Core (harmonized base layer) ontology in Turtle',
    format: 'Turtle'
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
  <div class="container mx-auto max-w-4xl px-4 py-10">
    <p class="eyebrow">Data service</p>
    <h1 class="mt-2 font-display text-4xl font-semibold tracking-tight">API &amp; Data Access</h1>

    <p class="text-ink/70 mb-8">
      Open Pharmacopoeia provides machine-readable data in JSON-LD and Turtle formats.
      All data is accessible via static file URLs.
    </p>

    <!-- Data Formats -->
    <section class="mb-8">
      <h2 class="text-xl font-semibold text-ink mb-4">Data Formats</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-paper rounded-xl shadow-md p-6">
          <h3 class="font-semibold text-ink mb-2">JSON-LD</h3>
          <p class="text-ink/70 text-sm mb-3">
            Linked Data format optimized for web applications and semantic web tools.
          </p>
          <code class="text-sm bg-wash px-2 py-1 rounded">.jsonld</code>
        </div>
        <div class="bg-paper rounded-xl shadow-md p-6">
          <h3 class="font-semibold text-ink mb-2">Turtle (TTL)</h3>
          <p class="text-ink/70 text-sm mb-3">
            Compact RDF format for triple stores and SPARQL endpoints.
          </p>
          <code class="text-sm bg-wash px-2 py-1 rounded">.ttl</code>
        </div>
      </div>
    </section>

    <!-- Endpoints -->
    <section class="mb-8">
      <h2 class="text-xl font-semibold text-ink mb-4">Available Endpoints</h2>
      <div class="bg-paper rounded-xl shadow-md overflow-hidden">
        <table class="w-full">
          <thead class="bg-wash">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium text-ink/75">Method</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-ink/75">Path</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-ink/75">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="endpoint in endpoints" :key="endpoint.path">
              <td class="px-4 py-3">
                <span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">GET</span>
              </td>
              <td class="px-4 py-3">
                <code class="text-sm text-pine">{{ endpoint.path }}</code>
              </td>
              <td class="px-4 py-3 text-sm text-ink/70">{{ endpoint.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Example -->
    <section class="mb-8">
      <h2 class="text-xl font-semibold text-ink mb-4">Example Response</h2>
      <div class="bg-ink rounded-xl p-4 overflow-auto">
        <pre class="text-sm text-paper">{{ exampleResponse }}</pre>
      </div>
    </section>

    <!-- Ontology -->
    <section>
      <h2 class="text-xl font-semibold text-ink mb-4">Ontology & Context</h2>
      <div class="bg-paper rounded-xl shadow-md p-6">
        <p class="text-ink/70 mb-4">
          The Open Pharmacopoeia ontology defines the vocabulary for pharmacopoeia data.
        </p>
        <ul class="space-y-2">
          <li>
            <strong>JSON-LD Context:</strong>
            <code class="ml-2 text-sm bg-wash px-2 py-1 rounded">/ontology/context/pharmacopoeia.jsonld</code>
          </li>
          <li>
            <strong>Core Ontology:</strong>
            <code class="ml-2 text-sm bg-wash px-2 py-1 rounded">/ontology/core/pharmacopoeia.ttl</code>
          </li>
          <li>
            <strong>Test Methods:</strong>
            <code class="ml-2 text-sm bg-wash px-2 py-1 rounded">/ontology/quality/test-method.ttl</code>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
