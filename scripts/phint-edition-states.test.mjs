import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readEditionProjection, editionsForEntry } from '../src/lib/edition-diff.js'
import { entries, entrySlug, bindCurrentSubstanceIdentities } from '../src/lib/build-data.js'
import { phintEditionDocument, phintEntryId } from './build-phint-edition-states.mjs'

const read = name => JSON.parse(fs.readFileSync(new URL(`../public/data/${name}`, import.meta.url)))
const committed = read('phint-edition-diffs.json')
const verified = readEditionProjection(read('edition-diffs.json'))
const graph = entries('phint')
const index = bindCurrentSubstanceIdentities(JSON.parse(fs.readFileSync(new URL('../data/search-index.json', import.meta.url))))
const SOURCE = 'd91fc7e816c284f9aaf3aa86bf41e3f19d163e2d'

test('committed PhInt pairs are unverified, carry no change values and stay out of edition-diffs.json', () => {
  const records = readEditionProjection(committed)
  for (const r of records) {
    assert.equal(r.publisher, 'phint')
    assert.equal(r.status, 'unverified')
    assert.deepEqual(r.changes, [])
    assert.ok(r.comparedFields.length > 0)
    assert.equal(r.to.edition, 'PhInt-13')
  }
  assert.ok(verified.every(r => r.status === 'verified'))
  const keys = new Set(verified.map(r => `${r.substanceId} ${r.from.edition}`))
  assert.ok(!records.some(r => keys.has(`${r.substanceId} ${r.from.edition}`)), 'no pair duplicates a verified record')
})

test('every committed pair reaches its PhInt-13 entry page', () => {
  for (const r of committed.records) {
    const entry = graph.find(e => e['@id'] === r.to.entryId)
    assert.ok(entry, `missing PhInt-13 entry ${r.to.entryId}`)
    const shown = editionsForEntry([...verified, ...committed.records], { publisher: 'phint', entryId: entry['@id'], edition: entry.edition, substanceId: r.substanceId, rights: 'full' })
    assert.ok(shown.includes(r))
  }
})

test('committed pairs come from data-international-pharmacopoeia d91fc7e8 substance-paired diffs', () => {
  // Source summaries at d91fc7e8 (pairing: substance-identity):
  //   11-to-12: common 861, changed 380, added 94, removed 57, ambiguous 42
  //   12-to-13: common 949, changed 5, added 14, removed 6, ambiguous 42
  // The hub carries PhInt-13 entries only, so the 380 11-to-12 pairs have no
  // entry page. Of the 5 12-to-13 pairs, one has no registry join (6-1-226) and
  // one (zidovudine) already has a verified record, leaving 3.
  assert.equal(committed.records.length, 3)
  assert.deepEqual(committed.records.map(r => r.substanceId).sort(), ['capsules', 'clofazimine', 'zidovudine-capsules'])
  for (const r of committed.records) {
    assert.match(r.evidence, new RegExp(`phint/12-to-13 at ${SOURCE};`))
    assert.match(r.evidence, /match: name/)
  }
})

test('builder excludes ambiguous groups and pairs without a PhInt-13 endpoint', () => {
  const r = committed.records[0], slug = entrySlug(graph.find(e => e['@id'] === r.to.entryId))
  const diff = { id: slug, from_id: 'x-1', match: 'name', from_edition: 'PhInt-12', to_edition: 'PhInt-13', diff: { tests: {} } }
  const summary = { pairing: 'substance-identity', changed_slugs: [slug], ambiguous_groups: [] }
  const ok = phintEditionDocument({ transitions: [{ name: '12-to-13', summary, diffs: { [slug]: diff } }], verifiedRecords: [], sourceCommit: SOURCE, graph, index })
  assert.equal(ok.document.records.length, 1)
  assert.equal(ok.document.records[0].from.entryId, phintEntryId('PhInt-12', 'x-1'))
  const amb = phintEditionDocument({ transitions: [{ name: '12-to-13', summary: { ...summary, ambiguous_groups: [{ from: ['x-1'], to: [slug] }] }, diffs: { [slug]: diff } }], verifiedRecords: [], sourceCommit: SOURCE, graph, index })
  assert.deepEqual(amb.skipped.map(s => s.reason), ['ambiguous'])
  const old = phintEditionDocument({ transitions: [{ name: '11-to-12', summary, diffs: { [slug]: { ...diff, from_edition: 'PhInt-11', to_edition: 'PhInt-12' } } }], verifiedRecords: [], sourceCommit: SOURCE, graph, index })
  assert.deepEqual(old.skipped.map(s => s.reason), ['no PhInt-13 endpoint'])
  assert.throws(() => phintEditionDocument({ transitions: [{ name: '12-to-13', summary: { ...summary, pairing: 'slug' }, diffs: {} }], verifiedRecords: [], sourceCommit: SOURCE, graph, index }), /substance identity/)
})
