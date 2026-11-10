import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readEditionProjection, editionsForEntry } from '../src/lib/edition-diff.js'
import { resolveEntrySelection } from '../src/lib/comparison-contract.js'
import { entries, entrySlug, entryCategory, bindCurrentSubstanceIdentities } from '../src/lib/build-data.js'
import { kpEditionDocument, kp12EntryId, kpSectionFields } from './build-kp-edition-states.mjs'

const committed = JSON.parse(fs.readFileSync(new URL('../public/data/kp-edition-diffs.json', import.meta.url)))
const graph = entries('kp')
const index = bindCurrentSubstanceIdentities(JSON.parse(fs.readFileSync(new URL('../data/search-index.json', import.meta.url))))

test('committed KP12 to KP13 pairs are unverified, carry no change values and name flagged sections', () => {
  const records = readEditionProjection(committed)
  assert.ok(records.length > 0)
  for (const r of records) {
    assert.equal(r.publisher, 'kp')
    assert.equal(r.status, 'unverified')
    assert.deepEqual(r.changes, [])
    assert.ok(r.comparedFields.length > 0)
    assert.equal(r.from.edition, 'KP12')
    assert.equal(r.to.edition, 'KP13')
  }
  assert.ok(!committed.attribution.includes('World Health Organization'))
})

test('every committed pair reaches its current KP13 entry page through the registry join', () => {
  for (const r of committed.records) {
    const entry = graph.find(e => e['@id'] === r.to.entryId)
    assert.ok(entry, `missing KP13 entry ${r.to.entryId}`)
    const slug = entrySlug(entry)
    assert.equal(r.from.entryId, kp12EntryId(slug))
    const selection = resolveEntrySelection(graph, index, { publisher: 'kp', slug, category: entryCategory(entry) })
    assert.equal(selection.substanceId, r.substanceId)
    const shown = editionsForEntry(committed.records, { publisher: 'kp', entryId: entry['@id'], edition: entry.edition, substanceId: r.substanceId, rights: 'full' })
    assert.deepEqual(shown, [r])
  }
})

test('builder skips entries without a hub entry or registry join and refuses an empty section list', () => {
  const joined = committed.records[0], slug = entrySlug(graph.find(e => e['@id'] === joined.to.entryId))
  const { document, skipped } = kpEditionDocument({ summary: { changed_slugs: [slug, 'no-such-kp-entry'] }, sectionsBySlug: { [slug]: ['assay'] }, sourceCommit: 'c'.repeat(40), graph, index })
  assert.equal(document.records.length, 1)
  assert.deepEqual(skipped, [{ slug: 'no-such-kp-entry', reason: 'no KP13 hub entry' }])
  assert.throws(() => kpEditionDocument({ summary: { changed_slugs: [slug] }, sectionsBySlug: { [slug]: [] }, sourceCommit: 'c'.repeat(40), graph, index }), /names no changed section/)
})

test('committed pairs come from the data-korea-pharmacopoeia main diff (41 changed of 2,313 common)', () => {
  // Re-checked by script against data-edition-diffs/kp/kp12-to-kp13 at 9eef5b8: 41 changed
  // entries, 18 of which join a registry substance through their KP13 hub entry.
  assert.equal(committed.records.length, 18)
  for (const r of committed.records) assert.match(r.evidence, / at 9eef5b8c486f02ffd04c8747fdb94a20a18a6028;/)
  assert.ok(!committed.records.some(r => r.substanceId === 'thioctic-acid'), 'thioctic-acid is unchanged on main')
})

test('Korean section headings map to English field names and unknown headings fail', () => {
  assert.deepEqual(kpSectionFields({ definition_changed: true, sections: { 정량법: 'edited', 순도시험: 'edited' } }), ['definition', 'assay', 'purity'])
  assert.deepEqual(kpSectionFields({ sections: { purity: 'edited' } }), ['purity'])
  assert.throws(() => kpSectionFields({ sections: { 성상: 'edited' } }), /Unmapped KP section heading/)
})
