// Cross-publisher typed limits and method mappings for the Compare view.
// Only full-rights publishers may carry tests; title-only publishers never do.
import { assertFields, detailAccess, publicEvidence, validateTest } from './comparison-contract.js'

export const PUBLISHER_COMPARISON_SCHEMA = 'openphar-publisher-comparison/v1'
// Dataset id -> publisher label used by chapter references in the ICH method catalog.
export const CATALOG_PUBLISHER = { jp: 'JP', chp: 'ChP', phint: 'Ph.Int.', kp: 'KP', tp: 'TP', thp: 'THP', ip: 'IP', ayp: 'API', hk: 'HKCMMS' }
// Held publishers (comparison-contract.js PUBLICATION_HOLD) are not publishable.
export const publishable = publisher => detailAccess(publisher) === 'eligible'

// Spellings of the same literal unit. This is a spelling table, not a unit conversion.
export const UNIT_SPELLINGS = { '%': '%', percent: '%', 'per cent': '%', ppm: 'ppm' }

const text = value => typeof value === 'string' && value.trim().length > 0
const fail = message => { throw new Error(`Invalid publisher comparison: ${message}`) }

export function normalizeUnit(unit) {
  const key = typeof unit === 'string' ? unit.trim().toLowerCase() : ''
  if (!Object.hasOwn(UNIT_SPELLINGS, key)) fail(`unit spelling not in the reviewed table: ${unit}`)
  return UNIT_SPELLINGS[key]
}

export const mappingKey = (publisher, chapter) => JSON.stringify([publisher, chapter])

function validateMapping(mapping) {
  assertFields(mapping, ['publisher', 'chapter', 'concepts'], 'method mapping')
  if (!text(mapping.publisher) || !text(mapping.chapter) || !Array.isArray(mapping.concepts)) fail('method mapping identity')
  if (!publishable(mapping.publisher)) fail('method mapping publisher policy')
  for (const concept of mapping.concepts) {
    assertFields(concept, ['id', 'label', 'harmonisationStatus', 'ichAnnex', 'source'], 'method concept')
    if (!['id', 'label', 'harmonisationStatus', 'source'].every(k => text(concept[k]))) fail('method concept fields')
    if (!['ich_official', 'curated'].includes(concept.source)) fail('method concept source')
  }
}

// citedTests: tests from other public projections (the WHO Ph.Int. facts) whose
// citations also get mapping records.
export function readPublisherComparison(document, citedTests = []) {
  assertFields(document, ['schema', 'notice', 'entries', 'methodMappings'], 'publisher comparison document')
  if (document.schema !== PUBLISHER_COMPARISON_SCHEMA || !Array.isArray(document.entries) || !Array.isArray(document.methodMappings)) fail('schema, entries or mappings')
  if (!publicEvidence(document.notice)) fail('public notice required')
  const seen = new Set(), current = new Map()
  for (const entry of document.entries) {
    assertFields(entry, ['publisher', 'entryId', 'substanceId', 'edition', 'role', 'currentEntryId', 'publication', 'tests'], 'entry')
    if (!['publisher', 'entryId', 'substanceId', 'edition'].every(k => text(entry[k]))) fail('entry identity is required')
    if (!publishable(entry.publisher)) fail('publisher detail policy')
    if (!['current', 'historical'].includes(entry.role)) fail('entry role')
    assertFields(entry.publication, ['status', 'authority'], 'publication')
    if (entry.publication.status !== 'permitted' || !publicEvidence(entry.publication.authority)) fail('public publication authority is required')
    if (!Array.isArray(entry.tests) || !entry.tests.length) fail('tests must be a non-empty array')
    const keys = new Set()
    for (const test of entry.tests) {
      validateTest(test, entry.edition)
      if (test.method && test.method.publisher !== entry.publisher) fail('method citation must be the entry publisher')
      if (keys.has(test.key)) fail('duplicate test key')
      keys.add(test.key)
    }
    const key = JSON.stringify([entry.publisher, entry.entryId, entry.edition])
    if (seen.has(key)) fail('duplicate entry identity')
    seen.add(key)
    if (entry.role === 'current') {
      if (Object.hasOwn(entry, 'currentEntryId')) fail('current entries do not name a current entry')
      current.set(JSON.stringify([entry.publisher, entry.entryId]), entry)
    }
  }
  for (const entry of document.entries.filter(e => e.role === 'historical')) {
    const anchor = current.get(JSON.stringify([entry.publisher, entry.currentEntryId]))
    if (!anchor || anchor.substanceId !== entry.substanceId || anchor.edition === entry.edition) fail('historical entry needs a current entry of the same publisher and substance')
  }
  const mappings = new Map()
  for (const mapping of document.methodMappings) {
    validateMapping(mapping)
    const key = mappingKey(mapping.publisher, mapping.chapter)
    if (mappings.has(key)) fail('duplicate method mapping')
    mappings.set(key, mapping)
  }
  for (const test of [...document.entries.flatMap(e => e.tests), ...citedTests]) {
    if (test.method && !mappings.has(mappingKey(test.method.publisher, test.method.chapter))) fail('cited chapter lacks a method mapping record')
  }
  return { entries: document.entries, mappings }
}

// Catalog concepts whose reported chapter references name this publisher chapter.
export function catalogConceptsFor(ichGraph, publisher, chapter) {
  const label = CATALOG_PUBLISHER[publisher]
  if (!label) return []
  const concepts = []
  for (const method of ichGraph) {
    if (!String(method['@id'] || '').includes('/data/ich/methods/') || !Array.isArray(method.sections)) continue
    const refs = method.sections.map(s => s.chapterReference).filter(r => r && r.publisher === label && r.code === chapter && r.referenceStatus === 'reported')
    if (!refs.length) continue
    const sources = new Set(refs.map(r => r.source))
    concepts.push({
      id: method['@id'].split('/').pop(),
      label: method.prefLabel?.en || method['@id'].split('/').pop(),
      harmonisationStatus: method.harmonisationStatus || 'unspecified',
      ...(method.ichAnnex ? { ichAnnex: method.ichAnnex } : {}),
      source: sources.has('ich_official') ? 'ich_official' : 'curated'
    })
  }
  return concepts.sort((a, b) => a.id.localeCompare(b.id))
}

export function buildMethodMappings(entries, ichGraph) {
  const seen = new Map()
  for (const test of entries.flatMap(e => e.tests)) {
    if (test.method && !publishable(test.method.publisher)) continue
    if (!test.method) continue
    const key = mappingKey(test.method.publisher, test.method.chapter)
    if (!seen.has(key)) seen.set(key, { publisher: test.method.publisher, chapter: test.method.chapter, concepts: catalogConceptsFor(ichGraph, test.method.publisher, test.method.chapter) })
  }
  return [...seen.values()].sort((a, b) => mappingKey(a.publisher, a.chapter).localeCompare(mappingKey(b.publisher, b.chapter)))
}

// One mapping row per comparison row: what each cited chapter maps to in the
// method catalog, and whether it shares a catalog family with the reference.
export function methodMappingCells(row, mappings) {
  const cells = row.cells.map(cell => {
    const method = cell.test?.method
    if (!method) return { column: cell.column, status: 'none', reason: cell.test ? 'No chapter citation supplied.' : 'No typed test.', concepts: [] }
    const mapping = mappings.get(mappingKey(method.publisher, method.chapter))
    const concepts = mapping?.concepts || []
    return { column: cell.column, method, concepts, status: concepts.length ? 'mapped' : 'unmapped', reason: concepts.length ? '' : 'Cited chapter is not in the method catalog.' }
  })
  const reference = cells.find(cell => cell.status === 'mapped')
  return cells.map(cell => {
    if (cell.status !== 'mapped') return cell
    if (cell === reference) return { ...cell, status: 'reference', reason: 'Reference method mapping for this row.' }
    const shared = cell.concepts.filter(c => reference.concepts.some(r => r.id === c.id))
    return shared.length
      ? { ...cell, status: 'shared', shared: shared.map(c => c.id), reason: `Shares catalog family ${shared.map(c => c.label).join(', ')} with the reference.` }
      : { ...cell, status: 'different', reason: 'No catalog family in common with the reference.' }
  })
}
