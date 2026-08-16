import { ref } from 'vue'
import FlexSearch from 'flexsearch'

// Global search over the generated cross-dataset title index
// (/data/search-index.json — titles only, produced by scripts/generate-datasets.mjs).
// Full monograph text is fetched only when an entry is opened.

let searchIndex = null
let entriesData = []
let isInitialized = false

export function useSearch() {
  const loading = ref(false)
  const error = ref(null)
  const initialized = ref(false)

  async function initialize() {
    if (isInitialized) {
      initialized.value = true
      return
    }
    loading.value = true
    error.value = null
    try {
      const res = await fetch('/data/search-index.json')
      entriesData = await res.json()

      searchIndex = new FlexSearch.Document({
        tokenize: 'forward',
        document: {
          id: 'i',
          index: [
            { field: 't', tokenize: 'forward' },
            { field: 'n', tokenize: 'forward' }
          ]
        }
      })
      entriesData.forEach((e, i) => searchIndex.add({ i, t: e.t, n: e.n || e.t }))
      isInitialized = true
      initialized.value = true
    } catch (e) {
      console.error('Failed to initialize search:', e)
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // options: { dataset, restricted } — restricted: true|false|undefined(all)
  function search(query, options = {}) {
    if (!searchIndex || !query || query.length < 2) return []
    const { dataset, restricted, limit = 60 } = options

    const tRes = searchIndex.search(query, { field: 't', limit: 2000, suggest: true })
    const nRes = searchIndex.search(query, { field: 'n', limit: 2000, suggest: true })
    const ids = new Set()
    for (const field of [tRes, nRes]) {
      for (const r of (Array.isArray(field) ? field : field?.result || [])) {
        ids.add(typeof r === 'object' ? r.i : r)
      }
    }

    let results = ids.map(i => entriesData[i]).filter(Boolean)
    if (dataset) results = results.filter(r => r.d === dataset)
    if (restricted !== undefined) results = results.filter(r => (r.k === 0) === restricted)
    return results.slice(0, limit)
  }

  function getAll(options = {}) {
    const { dataset, restricted, limit = 60 } = options
    let results = entriesData
    if (dataset) results = results.filter(r => r.d === dataset)
    if (restricted !== undefined) results = results.filter(r => (r.k === 0) === restricted)
    return results.slice(0, limit)
  }

  function getStats() {
    const byDataset = {}
    for (const r of entriesData) {
      byDataset[r.d] = (byDataset[r.d] || 0) + 1
    }
    return { total: entriesData.length, byDataset }
  }

  return { loading, error, initialized, initialize, search, getAll, getStats }
}
