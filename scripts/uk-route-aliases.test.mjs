import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { validateThaiAliases } from './thai-editions.mjs'

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))

test('validateThaiAliases accepts a publisher page target and still rejects unknown targets and collisions', () => {
  const routes = new Set(['/pharmacopoeia/uk/a/new'])
  validateThaiAliases({ routes: { '/pharmacopoeia/uk/a/old': '/pharmacopoeia/uk' } }, routes, new Set(['/pharmacopoeia/uk']))
  assert.throws(() => validateThaiAliases({ routes: { '/x': '/pharmacopoeia/uk' } }, routes), /Missing/)
  assert.throws(() => validateThaiAliases({ routes: { '/pharmacopoeia/uk/a/new': '/pharmacopoeia/uk' } }, routes, new Set(['/pharmacopoeia/uk'])), /collision/)
})

test('vendored data: every route of the 2025 UK graph that the data/bp glob drops still redirects', () => {
  const file = read('registry/uk-route-aliases.json')
  const graph = read('data/uk/uk-monographs.jsonld')['@graph']
  const live = new Set(graph.map(m => `/pharmacopoeia/uk/${m.category}/${m['@id'].split('/').pop()}`))
  assert.equal(Object.keys(file.routes).length, 38)
  assert.equal(new Set(graph.map(m => m['@id'])).size, graph.length)
  const aliases = read('data/route-aliases.json').routes
  for (const [from, to] of Object.entries(file.routes)) {
    assert.ok(!live.has(from), from)
    assert.ok(live.has(to) || to === '/pharmacopoeia/uk', to)
    assert.equal(aliases[from], to, from)
  }
  assert.equal(Object.values(file.routes).filter(to => to === '/pharmacopoeia/uk').length, 3)
})
