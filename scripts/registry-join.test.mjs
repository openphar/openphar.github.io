import assert from 'node:assert/strict'
import test from 'node:test'
import { createVendoredRegistryJoin } from './registry-join.mjs'

test('numbered Ph.Int. entries resolve in the current edition, independent of insertion order', () => {
  const entries = [
    ['https://openphar.org/data/phint/phint-12/entry/6-2-2-141', 'streptomycin-for-injection'],
    ['https://openphar.org/data/phint/phint-13/entry/6-2-2-141', 'four-drug-tablets']
  ]
  for (const ordered of [entries, [...entries].reverse()]) {
    const resolve = createVendoredRegistryJoin(Object.fromEntries(ordered))
    assert.equal(resolve('phint', '6-2-2-141', 'PhInt-13'), 'four-drug-tablets')
    assert.equal(resolve('phint', '6-2-2-141', '12th edition'), 'streptomycin-for-injection')
  }
})

test('a mapping from another edition cannot supply a current-edition identity', () => {
  const resolve = createVendoredRegistryJoin({
    'https://openphar.org/data/phint/phint-12/entry/6-2-2-141': 'streptomycin-for-injection'
  })
  assert.equal(resolve('phint', '6-2-2-141', 'PhInt-13'), undefined)
  assert.equal(resolve('phint', '6-2-2-141', undefined), undefined)
  assert.equal(resolve('phint', '6-2-2-141', 'unrecognized edition'), undefined)
})

test('JP language records share an identity only within the requested edition', () => {
  const resolve = createVendoredRegistryJoin({
    'https://openphar.org/data/jp/jp17/en/monograph/example': 'older-identity',
    'https://openphar.org/data/jp/jp18/en/monograph/example': 'current-identity',
    'https://openphar.org/data/jp/jp18/ja/monograph/example': 'current-identity'
  })
  assert.equal(resolve('jp', 'example', 'JP18'), 'current-identity')
  assert.equal(resolve('jp', 'example', 'JP17'), 'older-identity')
  assert.equal(resolve('jp', 'example', 'JP16'), undefined)
})

test('conflicting identities within an edition remain unresolved', () => {
  const resolve = createVendoredRegistryJoin({
    'https://openphar.org/data/jp/jp18/en/monograph/example': 'one',
    'https://openphar.org/data/jp/jp18/ja/monograph/example': 'another'
  })
  assert.equal(resolve('jp', 'example', 'JP18'), undefined)
})

test('an existing unambiguous named JP identity survives a missing harvested edition', () => {
  const resolve = createVendoredRegistryJoin({
    'https://openphar.org/data/jp/jp17/en/monograph/example': 'same-identity',
    'https://openphar.org/data/jp/jp17/ja/monograph/example': 'same-identity'
  })
  assert.equal(resolve('jp', 'example', 'JP18'), 'same-identity')
  assert.equal(resolve('jp', 'example', undefined), undefined)
})
