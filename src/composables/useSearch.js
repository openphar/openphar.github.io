import { ref, shallowRef } from 'vue'
import FlexSearch from 'flexsearch'

// Global search index - initialized once
let searchIndex = null
let monographsData = []
let isInitialized = false

// Extract string from LangString or string
function extractString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value['en'] || value['ja'] || value['la'] || value['@value'] || Object.values(value)[0] || ''
  }
  return String(value)
}

// Check if item is a monograph
function isMonograph(item) {
  const type = item['@type']
  if (Array.isArray(type)) {
    return type.some(t => typeof t === 'string' && t.endsWith('Monograph'))
  }
  return typeof type === 'string' && type.endsWith('Monograph')
}

// Get category from @id
function getCategory(id) {
  if (!id) return 'other'
  const match = id.match(/\/data\/[^/]+\/([^/]+)\//)
  return match ? match[1] : 'other'
}

// Get slug from @id
function getSlug(id) {
  if (!id) return ''
  const parts = id.split('/')
  return parts[parts.length - 1] || parts[parts.length - 2]
}

// Get publisher from @id
function getPublisher(id) {
  if (!id) return 'other'
  if (id.includes('/jp/')) return 'jp'
  if (id.includes('/phint/')) return 'phint'
  return 'other'
}

export function useSearch() {
  const loading = ref(false)
  const error = ref(null)
  const initialized = ref(false)

  // Initialize the search index
  async function initialize() {
    if (isInitialized) {
      initialized.value = true
      return
    }

    loading.value = true
    error.value = null

    try {
      // Load JP monographs
      const jpResponse = await fetch('/data/jp/jp-monographs.jsonld')
      const jpData = await jpResponse.json()
      const jpItems = jpData['@graph'] || []

      // Filter to only monographs
      monographsData = jpItems.filter(isMonograph).map((item, index) => ({
        id: index,
        '@id': item['@id'],
        '@type': item['@type'],
        name: extractString(item.prefLabel || item['rdfs:label']),
        definition: extractString(item.definition),
        appearance: extractString(item.appearance),
        publisher: getPublisher(item['@id']),
        category: getCategory(item['@id']),
        slug: getSlug(item['@id']),
        molecularFormula: item.molecularFormula || '',
        casNumber: item.casNumber || ''
      }))

      // Create FlexSearch index
      searchIndex = new FlexSearch.Document({
        tokenize: 'forward',
        document: {
          id: 'id',
          index: ['name', 'definition', 'molecularFormula', 'casNumber']
        }
      })

      // Add documents to index
      for (const monograph of monographsData) {
        searchIndex.add(monograph.id, {
          name: monograph.name,
          definition: monograph.definition,
          molecularFormula: monograph.molecularFormula,
          casNumber: monograph.casNumber
        })
      }

      isInitialized = true
      initialized.value = true
    } catch (e) {
      console.error('Failed to initialize search:', e)
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // Search function
  function search(query, options = {}) {
    if (!searchIndex || !query) {
      return []
    }

    const { publisher, category, limit = 50 } = options

    // Search using FlexSearch
    const results = searchIndex.search(query, { limit: 1000 })

    // Collect unique IDs from all field results
    const ids = new Set()
    for (const fieldResult of results) {
      for (const result of fieldResult.result) {
        ids.add(result)
      }
    }

    // Get monographs by IDs and apply filters
    let filteredResults = Array.from(ids).map(id => monographsData[id]).filter(Boolean)

    if (publisher) {
      filteredResults = filteredResults.filter(m => m.publisher === publisher)
    }

    if (category) {
      filteredResults = filteredResults.filter(m => m.category === category)
    }

    return filteredResults.slice(0, limit)
  }

  // Get all monographs (with optional filters)
  function getAll(options = {}) {
    const { publisher, category, limit = 100 } = options

    let results = [...monographsData]

    if (publisher) {
      results = results.filter(m => m.publisher === publisher)
    }

    if (category) {
      results = results.filter(m => m.category === category)
    }

    return results.slice(0, limit)
  }

  // Get categories list
  function getCategories() {
    const categories = new Set()
    for (const m of monographsData) {
      if (m.category && m.category !== 'other') {
        categories.add(m.category)
      }
    }
    return Array.from(categories).sort()
  }

  // Get stats
  function getStats() {
    return {
      total: monographsData.length,
      byPublisher: {
        jp: monographsData.filter(m => m.publisher === 'jp').length,
        phint: monographsData.filter(m => m.publisher === 'phint').length
      }
    }
  }

  return {
    loading,
    error,
    initialized,
    initialize,
    search,
    getAll,
    getCategories,
    getStats
  }
}
