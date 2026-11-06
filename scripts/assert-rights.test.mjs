import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { assertRights } from './assert-rights.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'scripts/assert-rights.mjs')
const IRI = 'https://www.openphar.org/data/us/monographs/synthetic-example'
const titleEntry = { '@id': IRI, '@type': 'TitleIndexEntry', prefLabel: { en: 'Synthetic Example' }, edition: 'E1', category: 'monographs' }
const row = { d: 'us', s: 'synthetic-example', c: 'monographs', t: 'Synthetic Example', k: 0 }
const openRow = { d: 'jp', s: 'synthetic-example', c: 'monographs', t: 'Synthetic Example', k: 1, sub: 'synthetic-example', definition: 'open text' }
const substance = extra => ({ id: 'synthetic-example', iri: 'https://openphar.org/substance/synthetic-example', preferred_name: { en: 'Synthetic Example' }, entries: [{ ...row, edition: 'E1', ...extra }, { ...openRow, edition: 'J1' }] })

// A minimal publishable tree: one title-only (us) and one full (jp) dataset.
const roots = []
test.after(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }) })
function fixture(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-rights-'))
  roots.push(root)
  const files = {
    'registry/datasets.yml': 'datasets:\n  jp:\n    short: JP\n    rights: full\n  us:\n    short: USP\n    rights: title-only\n',
    'data/us/us-monographs.jsonld': { '@graph': [titleEntry] },
    'data/jp/jp-monographs.jsonld': { '@graph': [{ '@id': 'https://www.openphar.org/data/jp/monographs/synthetic-example', '@type': 'Monograph', definition: { en: 'open text' } }] },
    'data/search-index.json': [row, openRow],
    'data/cross-links.json': { 'jp/synthetic-example': [row], 'us/synthetic-example': [openRow] },
    'data/substances/synthetic-example.json': substance(),
    'data/downloads/substances.ndjson': JSON.stringify(substance()) + '\n',
    'public/data/comparison-facts.json': { entries: [{ publisher: 'jp', entryId: 'x', substanceId: 'synthetic-example', tests: [{ key: 'assay' }] }] },
    'public/data/us-editions.json': { bySubstance: { 'synthetic-example': [{ '@id': 'https://openphar.org/data/usp/e1/entry/synthetic-example', '@type': 'TitleIndexEntry', prefLabel: { en: 'Synthetic Example' }, edition: 'E1' }] } },
    'public/favicon.svg': '<svg/>'
  }
  mutate(files)
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), typeof content === 'string' ? content : JSON.stringify(content))
  }
  return root
}

const fieldsOf = result => result.violations.flatMap(v => v.fields)

test('clean synthetic outputs pass; open datasets keep their full fields', () => {
  const result = assertRights({ root: fixture() })
  assert.deepEqual(result.violations, [])
  // graph, search row, cross-link row, substance entry, download entry, edition title
  assert.equal(result.summary.reduce((n, s) => n + s.records, 0), 6)
})

test('a title-only entry leaking a field in a substances file fails', () => {
  const result = assertRights({ root: fixture(f => { f['data/substances/synthetic-example.json'] = substance({ definition: 'SYNTHETIC_BODY' }) }) })
  assert.deepEqual(result.violations.map(v => [v.file, v.record, v.fields]), [[path.join('data/substances/synthetic-example.json'), 'us/monographs/synthetic-example', ['definition']]])
})

test('a title-only row leaking a field in the search index fails', () => {
  const result = assertRights({ root: fixture(f => { f['data/search-index.json'] = [{ ...row, sections: [{ text: 'SYNTHETIC_BODY' }] }, openRow] }) })
  assert.equal(result.violations.length, 1)
  assert.equal(result.violations[0].file, 'data/search-index.json')
  assert.deepEqual(result.violations[0].fields, ['sections'])
  // Substance joins and pooled aliases are excluded for title-only search rows.
  const joined = assertRights({ root: fixture(f => { f['data/search-index.json'] = [{ ...row, sub: 'synthetic-example', nn: 'alias' }, openRow] }) })
  assert.deepEqual(fieldsOf(joined), ['sub', 'nn'])
})

test('a title-only entry leaking a field in a download fails', () => {
  const result = assertRights({ root: fixture(f => { f['data/downloads/substances.ndjson'] = JSON.stringify(substance({ tests: [{ limit: 'SYNTHETIC' }] })) + '\n' }) })
  assert.equal(result.violations.length, 1)
  assert.equal(result.violations[0].file, 'data/downloads/substances.ndjson')
  assert.deepEqual(result.violations[0].fields, ['tests'])
})

test('cross-links, Compare projections and native-IRI title records are covered', () => {
  const cross = assertRights({ root: fixture(f => { f['data/cross-links.json'] = { 'jp/synthetic-example': [{ ...row, limit: 'SYNTHETIC' }] } }) })
  assert.deepEqual(fieldsOf(cross), ['limit'])
  const compare = assertRights({ root: fixture(f => { f['public/data/comparison-facts.json'] = { entries: [{ publisher: 'us', entryId: IRI, substanceId: 'synthetic-example', tests: [{ key: 'assay' }] }] } }) })
  assert.ok(fieldsOf(compare).includes('tests'))
  const byLabel = assertRights({ root: fixture(f => { f['public/data/edition-diffs.json'] = { records: [{ publisher: 'USP', substanceId: 'synthetic-example', changes: [] }] } }) })
  assert.deepEqual(fieldsOf(byLabel), ['changes'])
  const native = assertRights({ root: fixture(f => { f['public/data/us-editions.json'] = { bySubstance: { x: [{ '@id': 'https://openphar.org/data/usp/e1/entry/x', prefLabel: { en: 'X' }, method: 'SYNTHETIC' }] } } }) })
  assert.deepEqual(fieldsOf(native), ['method'])
})

test('content nested inside a permitted field fails', () => {
  const result = assertRights({ root: fixture(f => { f['data/us/us-monographs.jsonld'] = { '@graph': [{ ...titleEntry, prefLabel: { en: 'Synthetic Example', definition: 'SYNTHETIC_BODY' } }] } }) })
  assert.deepEqual(result.violations.map(v => [v.reason, v.fields]), [['non-title values in permitted fields', ['prefLabel']]])
  const marker = assertRights({ root: fixture(f => { f['data/search-index.json'] = [{ ...row, k: 1 }, openRow] }) })
  assert.deepEqual(fieldsOf(marker), ['k'])
})

test('non-TitleIndexEntry records and unverifiable data files fail closed', () => {
  const typed = assertRights({ root: fixture(f => { f['data/us/us-monographs.jsonld'] = { '@graph': [{ ...titleEntry, '@type': 'Monograph' }] } }) })
  assert.equal(typed.violations[0].reason, 'must be TitleIndexEntry')
  const csv = assertRights({ root: fixture(f => { f['data/downloads/substances.csv'] = 'id,title\n' }) })
  assert.deepEqual(csv.violations.map(v => v.reason), ['unverifiable file type in published data'])
})

test('the built site is scanned with --dist and a leak there exits 1', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, 'dist/data'), { recursive: true })
  fs.writeFileSync(path.join(root, 'dist/index.html'), '<html></html>')
  fs.writeFileSync(path.join(root, 'dist/data/search-index.json'), JSON.stringify([row]))
  assert.deepEqual(assertRights({ root, dist: path.join(root, 'dist') }).violations, [])
  fs.writeFileSync(path.join(root, 'dist/data/search-index.json'), JSON.stringify([{ ...row, definition: 'SYNTHETIC_BODY' }]))
  const leaked = assertRights({ root, dist: path.join(root, 'dist') })
  assert.deepEqual(leaked.violations.map(v => [v.file, v.fields]), [['dist/data/search-index.json', ['definition']]])
  assert.equal(assertRights({ root, dist: path.join(root, 'missing') }).violations[0].reason, 'build output missing')
})

test('the CLI exits 1 on a violation without printing field values', () => {
  const root = fixture(f => { f['data/search-index.json'] = [{ ...row, definition: 'SYNTHETIC_BODY' }, openRow] })
  // Run the real script against the fixture by copying it next to the fixture data.
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.copyFileSync(SCRIPT, path.join(root, 'scripts/assert-rights.mjs'))
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'))
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/assert-rights.mjs')], { encoding: 'utf8' })
  assert.equal(run.status, 1)
  assert.match(run.stdout, /data\/search-index\.json: us\/monographs\/synthetic-example — restricted fields: definition/)
  assert.doesNotMatch(run.stdout + run.stderr, /SYNTHETIC_BODY/)
})
