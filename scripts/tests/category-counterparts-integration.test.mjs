import test from 'node:test'
import assert from 'node:assert/strict'
import { counterparts } from '../../src/lib/build-data.js'
import { counterpartKey } from '../entry-routes.mjs'

test('AYP category-scoped counterpart lookup reaches the current IP detail route', () => {
  const rows = counterparts('ayp', 'haritaki', 'ingredients')
  const ip = rows.find(row => row.d === 'ip' && row.s === 'haritaki')

  assert.deepEqual(ip, { d: 'ip', s: 'haritaki', c: 'monographs', t: 'Haritaki', k: 1 })
  assert.equal(counterpartKey('ayp', 'ingredients', 'haritaki'), 'ayp/ingredients/haritaki')
  assert.equal(`/pharmacopoeia/${ip.d}/${ip.c}/${ip.s}`, '/pharmacopoeia/ip/monographs/haritaki')
})

test('non-AYP datasets keep their existing two-segment counterpart keys', () => {
  assert.equal(counterpartKey('ip', 'monographs', 'haritaki'), 'ip/haritaki')
  assert.equal(counterpartKey('eu', 'medicinal-and-pharmaceutical-substances', 'paracetamol'), 'eu/paracetamol')
  assert.ok(counterparts('ip', 'haritaki', 'monographs').some(row => row.d === 'ayp' && row.s === 'haritaki' && row.c === 'ingredients'))
})
