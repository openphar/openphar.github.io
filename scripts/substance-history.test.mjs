import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// Execute the actual loader with controlled HTTP results: covers route changes
// without substituting a second implementation of the component's decision.
const source = fs.readFileSync(new URL('../src/views/SubstanceView.vue', import.meta.url), 'utf8')
const loader = source.match(/async function loadSubstance\(\) \{[\s\S]*?\n\}/)[0]
async function load(history, slug = 'retired', current = null) {
  const navigations = []
  const state = {
    loadVersion: 0, route: { params: { slug } },
    doc: { value: null }, missing: { value: false }, historical: { value: null }, publishers: { value: {} },
    router: { replace: async target => navigations.push(target) },
    fetch: async url => ({ ok: url.includes('/substances/') ? !!current : true,
      json: async () => url.endsWith('/registry.json') ? [] : url.includes('/substances/') ? current : history })
  }
  await vm.runInNewContext(`(${loader})`, state)()
  return { state, navigations }
}
test('merged public identity follows its current target through the router', async () => {
  const { navigations } = await load({ retired: { status: 'redirect', target: 'survivor' } })
  assert.deepEqual(navigations, ['/substance/survivor'])
})
test('withdrawn and missing identities preserve their distinct states', async () => {
  const record = { status: 'withdrawn', entries: [] }
  const withdrawn = await load({ retired: record })
  assert.deepEqual(withdrawn.navigations, [])
  assert.equal(withdrawn.state.historical.value, record)
  assert.equal(withdrawn.state.missing.value, false)
  assert.equal((await load({})).state.missing.value, true)
})
test('active identity takes precedence and malformed history cannot navigate', async () => {
  const doc = { id: 'retired' }
  const active = await load({ retired: { status: 'redirect', target: 'survivor' } }, 'retired', doc)
  assert.equal(active.state.doc.value, doc)
  assert.deepEqual(active.navigations, [])
  for (const target of ['retired', '../private', 'https://example.com', null]) {
    assert.deepEqual((await load({ retired: { status: 'redirect', target } })).navigations, [])
  }
})
