import test from 'node:test'
import assert from 'node:assert/strict'
import { selectThaiEditions, preserveThaiLegacy, thaiCategory, validateThaiAliases } from './thai-editions.mjs'
import { labelsOf, nativeLabelOf } from './native-labels.mjs'
const row = (publisher, edition, slug, type = 'monograph') => ({ doc: {
  publisher, edition, canonical_iri: `https://openphar.org/data/${publisher.toLowerCase()}/${edition.toLowerCase()}/entry/${slug}`,
  names: { en: `Example ${slug}`, th: 'ตัวอย่าง' }, classification: { publisher_type: type }
} })
const cfg = { publisher: 'TP', editions: ['TP-old', 'TP-new'], exclude_editions: ['TP-duplicate'] }

test('newest canonical slug wins regardless of input order; older unique entries survive', () => {
  const old = row('TP', 'TP-old', 'example'), newest = row('TP', 'TP-new', 'example')
  const unique = row('TP', 'TP-old', 'retained', 'appendix')
  const duplicate = row('TP', 'TP-duplicate', 'duplicate')
  for (const input of [[newest, unique, duplicate, old], [old, duplicate, unique, newest]]) {
    const result = selectThaiEditions(input, cfg)
    assert.deepEqual(new Set(result.rows), new Set([newest, unique]))
    assert.equal(result.ledger.filter(r => r.disposition === 'superseded').length, 1)
    assert.equal(result.ledger.filter(r => r.disposition === 'duplicate-edition-excluded').length, 1)
  }
  assert.equal(thaiCategory(unique.doc), 'appendices')
})

test('publisher mixing, unknown editions/types, duplicate identities fail closed', () => {
  for (const input of [[row('THP', 'TP-old', 'same')], [row('TP', 'TP-future', 'same')],
    [row('TP', 'TP-old', 'same', 'unknown')], [row('TP', 'TP-old', 'same'), row('TP', 'TP-old', 'same')]]) {
    assert.throws(() => selectThaiEditions(input, cfg))
  }
})

test('legacy URLs and public IRIs map exactly; unmatched content remains TP with source edition', () => {
  const current = row('TP', 'TP-new', 'current', 'appendix')
  const legacy = [row('THP', 'THP-1', 'current'), row('THP', 'THP-1', 'retained')]
  const before = JSON.stringify(legacy)
  const result = preserveThaiLegacy([current], legacy)
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[1].doc.publisher, 'TP')
  assert.equal(result.rows[1].doc.edition, 'TP II 2011 (legacy extraction)')
  assert.deepEqual(result.rows[1].doc.names, legacy[1].doc.names)
  assert.equal(result.aliases.routes['/pharmacopoeia/thp/monographs/current'], '/pharmacopoeia/tp/appendices/current')
  assert.equal(result.aliases.identities['https://www.openphar.org/data/thp/monographs/retained'], 'https://www.openphar.org/data/tp/monographs/retained')
  assert.deepEqual(result.ledger.map(r => r.disposition), ['replaced-by-current-tp', 'retained-legacy-tp'])
  assert.equal(JSON.stringify(legacy), before)
})

test('Thai names are script checked, correctly tagged, preferred over Latin, with no provenance export', () => {
  const doc = { names: { en: 'Example', th: 'ตัวอย่าง', la: 'Exemplum', family: 'Private family' }, provenance: { notes: 'PRIVATE_SENTINEL' } }
  for (const pub of ['TP', 'THP']) {
    const labels = labelsOf(doc, pub)
    assert.deepEqual(labels, { en: 'Example', la: 'Exemplum', th: 'ตัวอย่าง' })
    assert.equal(nativeLabelOf(labels), 'ตัวอย่าง')
  }
  assert.equal(labelsOf({ names: { en: 'Example', th: 'Example' } }, 'TP').th, undefined)
  assert.equal(labelsOf(doc, 'USP').th, undefined)
})

test('missing editions, legacy collisions and missing destinations fail closed', () => {
  assert.throws(() => selectThaiEditions([], cfg), /Missing Thai edition/)
  const aliases = { routes: { '/old': '/new' } }
  assert.throws(() => validateThaiAliases(aliases, new Set(['/old', '/new'])), /collision/)
  assert.throws(() => validateThaiAliases(aliases, new Set()), /Missing/)
  assert.doesNotThrow(() => validateThaiAliases(aliases, new Set(['/new'])))
})
