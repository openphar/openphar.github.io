import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { projectIdentity, createCurrentIdentityJoin } from './public-identities.mjs'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = 'https://openphar.org/data/usp/2025-usp48-nf43/entry/example'
const sub = { id: 'example', canonical_iri: 'https://openphar.org/substance/example', preferred_name: { en: 'Example', private_notes: 'PRIVATE_SENTINEL' }, names: { zh: ['示例'], secret: ['PRIVATE_SENTINEL'] }, identifiers: { cas_rn: '50-00-0', secret: 'PRIVATE_SENTINEL' }, occurrences: [{ publisher: 'USP', edition: '2025-USP48-NF43', entry: source }], same_substance_as: ['dangling-private-advisory'], private_notes: 'PRIVATE_SENTINEL' }
test('factual projection excludes private nested fields and dangling advisory edges', () => {
  const doc = projectIdentity({ ...sub, form_relations: [{ slug: 'missing', iri: 'https://openphar.org/substance/missing', relation: 'salt-or-hydrate-of-this' }] }, [], new Set(['example']))
  assert.deepEqual(doc.preferred_name, { en: 'Example' })
  assert.deepEqual(doc.names, { zh: ['示例'] })
  assert.deepEqual(doc.identifiers, { cas_rn: '50-00-0' })
  assert.deepEqual(doc.form_relations, [])
  assert.doesNotMatch(JSON.stringify(doc), /PRIVATE_SENTINEL|dangling-private/)
})
test('current joins require exact source, publisher, edition and route category', () => {
  const join = createCurrentIdentityJoin([sub], { [source]: 'example' })
  assert.equal(join('us', 'monographs', 'example', '2025-USP48-NF43').id, 'example')
  for (const args of [['us', 'appendices', 'example', '2025-USP48-NF43'], ['us', 'monographs', 'example', '2024-USP47-NF42'], ['uk', 'monographs', 'example', '2025-USP48-NF43']]) assert.equal(join(...args), undefined)
  assert.equal(createCurrentIdentityJoin([sub], { [source]: 'other' })('us', 'monographs', 'example', '2025-USP48-NF43'), undefined)
  const other = { ...sub, id: 'other', occurrences: [{ ...sub.occurrences[0], entry: source.replace('/entry/', '/ouryao/') }] }
  assert.equal(createCurrentIdentityJoin([sub, other], { [source]: 'example' })('us', 'monographs', 'example', '2025-USP48-NF43').id, 'example')
  const veterinarySource = 'https://openphar.org/data/bp/entry/example'
  const veterinary = { ...sub, occurrences: [{ publisher: 'BP', edition: '2025-BP', entry: veterinarySource }] }
  assert.equal(createCurrentIdentityJoin([veterinary], { [veterinarySource]: 'example' })('uk', 'veterinary', 'example', '2025-BP').id, 'example')
  const a = { ...sub, occurrences: [{ publisher: 'ChP', edition: 'ChP-2025', entry: 'https://openphar.org/data/chp/chp-2025/entry/32' }] }
  const b = { ...a, id: 'other', occurrences: [{ ...a.occurrences[0], entry: 'https://openphar.org/data/chp/chp-2025/ouryao/entry-32' }] }
  assert.equal(createCurrentIdentityJoin([a, b], { [a.occurrences[0].entry]: 'example', [b.occurrences[0].entry]: 'other' })('chp', 'monographs', '32', 'ChP-2025'), undefined)
})
test('full and selected generation use the same safe identity/download contract and preserve history', () => {
  fs.mkdirSync(path.join(ROOT, '.local'), { recursive: true })
  const dir = fs.mkdtempSync(path.join(ROOT, '.local', 'public-identities-'))
  const write = (name, bytes) => { const p = path.join(dir, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes) }
  try {
    for (const name of ['generate-datasets.mjs', 'native-labels.mjs', 'thai-editions.mjs', 'registry-join.mjs', 'search-policy.mjs', 'public-identities.mjs']) write(`scripts/${name}`, fs.readFileSync(path.join(ROOT, 'scripts', name)))
    write('registry/datasets.yml', 'datasets:\n  us:\n    short: USP\n    edition: 2025-USP48-NF43\n    rights: title-only\n    generate:\n      repo: input\n      glob: data/*.yaml\n')
    write('input/data/example.yaml', `canonical_iri: ${source}\nedition: 2025-USP48-NF43\nnames:\n  en: Example\nsections:\n  - name: Definition\n    text: PRIVATE_SENTINEL\n`)
    const otherSource = 'https://openphar.org/data/chp/chp-2025/entry/456'
    const other = { ...sub, id: 'other', canonical_iri: 'https://openphar.org/substance/other', occurrences: [{ publisher: 'ChP', edition: 'ChP-2025', entry: otherSource }] }
    write('data/chp/chp-monographs.jsonld', JSON.stringify({ '@graph': [{ '@id': 'https://www.openphar.org/data/chp/monographs/456', '@type': 'IndexedMonograph', prefLabel: { en: 'Example' }, edition: 'ChP-2025', category: 'monographs', casNumber: '50-00-0' }] }))
    fs.appendFileSync(path.join(dir, 'registry/datasets.yml'), '  chp:\n    short: ChP\n    edition: ChP-2025\n    rights: full\n')
    write('control/substances.json', JSON.stringify([sub, other]))
    write('control/entry-to-substance.json', JSON.stringify({ [source]: 'example', [otherSource]: 'other' }))
    write('data/substances/retired.json', JSON.stringify({ id: 'retired', entries: [] }))
    write('data/substances/split.json', JSON.stringify({ id: 'split', entries: [] }))
    write('data/downloads/substances.ndjson', [{ id: 'retired', occurrences: [{ entry: source }] }, { id: 'split', occurrences: [{ entry: source }, { entry: source + '-missing' }] }].map(x => JSON.stringify(x)).join('\n'))
    const run = extra => {
      const p = spawnSync(process.execPath, ['scripts/generate-datasets.mjs', '--registry-dir', 'control', ...extra], { cwd: dir, encoding: 'utf8' })
      assert.equal(p.status, 0, p.stderr)
      const doc = JSON.parse(fs.readFileSync(path.join(dir, 'data/substances/example.json')))
      const download = fs.readFileSync(path.join(dir, 'data/downloads/substances.ndjson'), 'utf8')
      const links = JSON.parse(fs.readFileSync(path.join(dir, 'data/cross-links.json')))
      assert.equal(links['us/example']?.some(e => e.d === 'chp'), undefined, 'same title and CAS cannot join different source identities')
      assert.doesNotMatch(download, /PRIVATE_SENTINEL|same_substance_as|occurrences/)
      assert.deepEqual(download.trim().split('\n').map(JSON.parse).find(x => x.id === 'example'), doc)
      assert.equal(doc.entries.length, 1)
      assert.equal(doc.entries[0].d, 'us')
      assert.match(JSON.parse(fs.readFileSync(path.join(dir, 'data/search-index.json'))).find(r => r.d === 'chp').nn, /示例/, 'approved identity names must be searchable even when a Latin label is the display title')
      const search = JSON.parse(fs.readFileSync(path.join(dir, 'data/search-index.json')))
      assert.equal(search[0].sub, undefined)
      return doc
    }
    const full = run([])
    const history = JSON.parse(fs.readFileSync(path.join(dir, 'data/substance-history.json')))
    assert.deepEqual(history.retired, { status: 'redirect', target: 'example' })
    assert.equal(history.split.status, 'withdrawn')
    assert.equal(history.split.source_iris.length, 2)
    assert.equal(fs.existsSync(path.join(dir, 'data/substances/split.json')), false)
    assert.deepEqual(run(['--datasets', 'us', '--source', 'us=input', '--refresh-identities', 'true']), full)
    assert.deepEqual(run(['--datasets', 'us', '--source', 'us=input', '--refresh-identities', 'true']), full)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
test('vendored Thai joins retain exact native edition-prefixed source IRIs', () => {
  const cases = [
    ['tp', 'TP', 'TP-2011-Vol-I-Part-1', 'tp-2011-vol-i-part-1', 'cefotaxime-sodium'],
    ['tp', 'TP', 'TP-2011-Supplement-2024', 'tp-2011-supp-2024', 'coriander'],
    ['thp', 'THP', 'THP-2020-Vol-I', 'thp-2020-vol-i', 'citronella-oil']
  ]
  for (const [dataset, publisher, edition, sourceEdition, slug] of cases) {
    const entry = `https://openphar.org/data/${dataset}/${sourceEdition}/entry/${slug}`
    const record = { ...sub, id: slug, occurrences: [{ publisher, edition, entry }] }
    const join = createCurrentIdentityJoin([record], { [entry]: slug })
    assert.deepEqual(join(dataset, 'monographs', slug, edition), { id: slug, sources: [entry] })
    assert.equal(join(dataset, 'appendices', slug, edition), undefined)
    assert.equal(join(dataset, 'monographs', slug, edition + '-other'), undefined)
    assert.equal(join(dataset === 'tp' ? 'thp' : 'tp', 'monographs', slug, edition), undefined)
    const wrong = { ...record, occurrences: [{ publisher, edition, entry: entry.replace(sourceEdition, sourceEdition + '-other') }] }
    assert.equal(createCurrentIdentityJoin([wrong], { [wrong.occurrences[0].entry]: slug })(dataset, 'monographs', slug, edition), undefined)
  }
})
