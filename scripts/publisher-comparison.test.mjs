import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validatePublisherComparison, loadInputs } from './check-publisher-comparison.mjs'
import { canonicalLimit, jpLimit, selectTest } from './build-publisher-comparison.mjs'
import { loadPolicy, scanDocument } from './assert-rights.mjs'
import { readComparisonProjection, comparisonMatrix, detailAccess, resolveEntrySelection, PUBLICATION_HOLD } from '../src/lib/comparison-contract.js'
import { readPublisherComparison, methodMappingCells, normalizeUnit, publishable } from '../src/lib/publisher-comparison.js'

const read = rel => JSON.parse(fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'))
const projection = read('public/data/publisher-comparison.json')
const who = readComparisonProjection(read('public/data/comparison-facts.json'))
const whoTests = who.flatMap(e => e.tests)
const inputs = loadInputs()

const kpEntry = (extra = {}) => ({
  publisher: 'kp', entryId: 'https://www.openphar.org/data/kp/part1/example', substanceId: 'example', edition: 'KP13', role: 'current',
  publication: { status: 'permitted', authority: 'Registry rights: full' },
  tests: [{ key: 'lod', label: 'Loss on drying', semanticKey: 'loss-on-drying', basis: 'Dry at 105°C', unit: '%', evidence: 'KP13 example', limit: { operator: '<=', value: '0.5' } }],
  ...extra
})
const doc = entries => ({ schema: 'openphar-publisher-comparison/v1', notice: 'Selected limits.', entries, methodMappings: [] })

test('actual projection passes the gate and publishes no held or new typed limits', () => {
  assert.deepEqual(validatePublisherComparison(projection, inputs), {
    entries: 0, historicalEntries: 0, tests: 0, citations: 0, methodMappings: 4, mappedChapters: 3, publishersBySubstance: {}
  })
  assert.ok(projection.methodMappings.every(m => m.publisher === 'phint'))
})

test('publication hold: JP, ChP and IP typed limits are rejected until the switch is flipped', () => {
  assert.deepEqual([...PUBLICATION_HOLD].sort(), ['chp', 'ip', 'jp'])
  for (const publisher of ['jp', 'chp', 'ip']) {
    assert.equal(detailAccess(publisher, 'full'), 'held')
    assert.equal(publishable(publisher), false)
    assert.throws(() => readPublisherComparison(doc([kpEntry({ publisher })])), /publisher detail policy/)
    const d = structuredClone(projection); d.methodMappings.push({ publisher, chapter: '2.44', concepts: [] })
    assert.throws(() => validatePublisherComparison(d, inputs), /publisher policy/)
  }
  for (const publisher of ['us', 'eu', 'uk', 'USP', 'unknown']) assert.throws(() => readPublisherComparison(doc([kpEntry({ publisher })])))
  assert.equal(publishable('phint'), true)
})

test('all-publisher edition switch: a historical entry must anchor to a current entry of the same publisher', () => {
  const current = kpEntry()
  const historical = kpEntry({ role: 'historical', edition: 'KP12', entryId: 'https://openphar.org/data/kp/kp12/example', currentEntryId: current.entryId })
  assert.equal(readPublisherComparison(doc([current, historical])).entries.length, 2)
  assert.throws(() => readPublisherComparison(doc([current, { ...historical, currentEntryId: 'https://www.openphar.org/data/kp/part1/other' }])), /historical entry/)
  assert.throws(() => readPublisherComparison(doc([current, { ...historical, substanceId: 'other' }])), /historical entry/)
  assert.throws(() => readPublisherComparison(doc([{ ...current, raw_text: 'PRIVATE_SENTINEL' }])))
})

test('Ph.Int. method mapping rows resolve WHO citations through the ICH catalog', () => {
  const { mappings } = readPublisherComparison(projection, whoTests)
  const statuses = substanceId => {
    const columns = who.filter(e => e.substanceId === substanceId).map(e => ({ key: e.edition, facts: e }))
    const row = comparisonMatrix(columns).find(r => r.semantic === 'active-substance-content')
    return Object.fromEntries(methodMappingCells(row, mappings).map(c => [c.column.key, c.status]))
  }
  assert.deepEqual(statuses('albendazole'), { 'PhInt-13': 'reference', 'PhInt-11': 'shared' })
  assert.deepEqual(statuses('paracetamol'), { 'PhInt-13': 'reference', 'PhInt-12': 'shared' })
  assert.deepEqual(statuses('zidovudine'), { 'PhInt-13': 'unmapped', 'PhInt-12': 'reference' }) // HPLC 1.14.1 is not in the catalog
  const d = structuredClone(projection); d.methodMappings[0].concepts = [{ id: 'x', label: 'x', harmonisationStatus: 'harmonised', source: 'curated' }]
  assert.throws(() => validatePublisherComparison(d, inputs), /method mappings differ/)
  const missing = structuredClone(projection); missing.methodMappings.pop()
  assert.throws(() => validatePublisherComparison(missing, inputs), /lacks a method mapping/)
})

test('JP entries without their own edition resolve through the registry edition', () => {
  const graph = inputs.graphs.jp
  const args = { publisher: 'jp', slug: 'acetaminophen', category: 'chemicals' }
  assert.equal(resolveEntrySelection(graph, inputs.index, args), null)
  const selection = resolveEntrySelection(graph, inputs.index, { ...args, datasetEdition: 'JP18' })
  assert.deepEqual([selection.edition, selection.substanceId], ['JP18', 'paracetamol'])
  assert.equal(resolveEntrySelection(graph, inputs.index, { ...args, datasetEdition: 'JP17' }), null)
})

test('rights gate finds no restricted publisher record in the projection', () => {
  const violations = []
  scanDocument(projection, 'publisher-comparison.json', loadPolicy(), violations)
  assert.deepEqual(violations, [])
})

test('builder takes exactly the reviewed source values and fails on drift', () => {
  const source = { name: 'Loss on drying at 105°C to constant weight', limit_operator: '<=', limit_value: '0.5', limit_unit: '%', limit_status: 'structured', method_ref: { code: '4' } }
  const selected = { index: 3, subject: 'Loss on drying', basisText: '105°C', expect: { operator: '<=', value: '0.5', unit: '%' }, key: 'lod', label: 'Loss on drying', semanticKey: 'loss-on-drying', basis: 'Dry at 105°C', method: { chapter: '4', label: 'LOD' } }
  const built = selectTest(canonicalLimit(source), selected, 'kp', 'KP13', 'KP13 example')
  assert.deepEqual(built.limit, { operator: '<=', value: '0.5' })
  assert.equal(built.method.chapter, '4')
  assert.throws(() => selectTest(canonicalLimit({ ...source, limit_value: '1.0' }), selected, 'kp', 'KP13', 'x'), /value differs/)
  assert.throws(() => selectTest(canonicalLimit(source), { ...selected, method: { chapter: '9', label: 'x' } }, 'kp', 'KP13', 'x'), /method citation/)
  assert.throws(() => canonicalLimit({ ...source, limit_status: 'prose' }), /not a structured limit/)
  const jp = jpLimit({ testName: { en: 'Residue on Ignition' }, harmonizedMethod: 'ResidueOnIgnition', limit: { limitType: 'LimitType-NotMoreThan', limitValue: 0.1, limitUnit: 'percent' } })
  assert.deepEqual([jp.operator, jp.value, normalizeUnit(jp.unit)], ['<=', '0.1', '%'])
  assert.throws(() => normalizeUnit('mg/g'), /spelling/)
})
