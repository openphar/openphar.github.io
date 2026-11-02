import test from 'node:test'
import assert from 'node:assert/strict'
import { useSearch } from '../src/composables/useSearch.js'

test('native, IAST-title, and pooled-name queries search the real index', async () => {
  const originalFetch = globalThis.fetch
  const rows = [
    { d: 'ayp', s: 'example-herb', c: 'herbs', t: 'Guḍūcī', n: 'गुडूची', l: 'sa-Deva', nn: 'Guduchi 蒺藜' },
    { d: 'other', s: 'other-entry', c: 'roots', t: 'Other entry', n: 'अन्य', nn: '' }
  ]
  globalThis.fetch = async (url) => {
    assert.equal(url, '/data/search-index.json')
    return { json: async () => rows }
  }

  try {
    const search = useSearch()
    await search.initialize()

    assert.equal(search.initialized.value, true)
    assert.equal(search.error.value, null)
    assert.deepEqual(search.getStats(), { total: 2, byDataset: { ayp: 1, other: 1 } })
    assert.deepEqual(search.search('गुडूची').map(({ d, s }) => ({ d, s })), [{ d: 'ayp', s: 'example-herb' }])
    assert.deepEqual(search.search('Guḍūcī').map(({ d, s }) => ({ d, s })), [{ d: 'ayp', s: 'example-herb' }])
    assert.deepEqual(search.search('Guduchi').map(({ d, s }) => ({ d, s })), [{ d: 'ayp', s: 'example-herb' }])
  } finally {
    globalThis.fetch = originalFetch
  }
})
