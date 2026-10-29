import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { dump } from 'js-yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
test('native selected producer preserves public data, labels, routes and private-field boundaries', () => {
  const local = path.join(ROOT, '.local')
  fs.mkdirSync(local, { recursive: true })
  const dir = fs.mkdtempSync(path.join(local, 'thai-generator-'))
  const write = (name, data) => {
    const file = path.join(dir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, data)
  }
  for (const file of ['generate-datasets.mjs', 'native-labels.mjs', 'thai-editions.mjs', 'registry-join.mjs', 'search-policy.mjs', 'public-identities.mjs']) {
    write(`scripts/${file}`, fs.readFileSync(path.join(ROOT, 'scripts', file)))
  }
  const doc = (publisher, edition, slug, title) => ({
    publisher, edition, canonical_iri: `https://openphar.org/data/${publisher.toLowerCase()}/${edition.toLowerCase()}/entry/${slug}`,
    names: { en: title, th: 'ตัวอย่าง' }, classification: { publisher_type: 'monograph' },
    definition: { text: `Public definition ${edition}` },
    sections: [{ name: 'Definition', text: `Public definition ${edition}` },
      { name: 'Source span reference-docs/ocr/PRIVATE_SENTINEL.md:1-2', text: 'Public source text ![](page=1,bbox=[1,2,3,4])' }],
    api: { raw_path: 'PRIVATE_SENTINEL.pdf' }, provenance: { notes: 'PRIVATE_SENTINEL' }
  })
  const old = doc('TP', 'TP-old', 'example', 'Old example'), current = doc('TP', 'TP-new', 'example', 'Current example')
  const unique = doc('TP', 'TP-old', 'unique', 'Unique retained')
  unique.classification.publisher_type = 'appendix'
  const herb = doc('THP', 'THP-current', 'herb', 'Example herb')
  for (const d of [old, current, unique, herb]) write(`input/data/${d.publisher.toLowerCase()}/${d.edition}/${d.canonical_iri.split('/').pop()}.yaml`, dump(d))
  for (const slug of ['example', 'legacy']) write(`input/data/THP-1/yaml/${slug}.yaml`, dump(doc('THP', 'THP-1', slug, `Legacy ${slug}`)))
  const config = (publisher, editions) => ({ short: publisher, name: publisher, rights: 'full', generate: {
    repo: 'unused', glob: `data/${publisher.toLowerCase()}/**/*.yaml`, mode: 'full',
    edition_stack: { publisher, editions }
  } })
  const tp = config('TP', ['TP-old', 'TP-new']); tp.generate.legacy_glob = 'data/THP-1/yaml/*.yaml'; tp.generate.legacy_count = 2
  const us = { '@id': 'https://www.openphar.org/data/us/monographs/example', '@type': 'TitleIndexEntry', prefLabel: { en: 'Different restricted title' }, edition: 'Synthetic', category: 'monographs' }
  const otherGraph = JSON.stringify({ '@graph': [us] }, null, 2)
  write('registry/datasets.yml', dump({ datasets: { tp, thp: config('THP', ['THP-current']), us: { short: 'USP', rights: 'title-only', generate: { repo: 'must-not-read', glob: 'data/us/*.yaml' } } } }))
  write('data/us/us-monographs.jsonld', otherGraph)
  const existingSearchRow = { d: 'us', s: 'example', c: 'monographs', t: 'Previously indexed example', n: 'مثال', l: 'ar', x: '50-00-0', k: 0, sub: 'example' }
  write('data/search-index.json', JSON.stringify([existingSearchRow]))
  const publicSub = { id: 'example', names: { en: ['Public identity'] }, entries: [{ d: 'us', s: 'example', c: 'monographs', t: 'Current example', k: 0, edition: 'Synthetic' }] }
  write('data/substances/example.json', JSON.stringify(publicSub))
  write('data/downloads/substances.ndjson', JSON.stringify({ id: 'example', occurrences: [] }) + '\n')
  write('control/entry-to-substance.json', JSON.stringify({ [current.canonical_iri]: 'example',
    // A different edition must not supply the current herb's substance identity.
    'https://openphar.org/data/thp/thp-other/entry/herb': 'wrong-identity',
    'https://openphar.org/data/usp/synthetic/entry/example': 'example' }))
  write('control/substances.json', JSON.stringify([{ id: 'example', canonical_iri: 'https://openphar.org/substance/example', names: publicSub.names, private_notes: 'PRIVATE_SENTINEL', occurrences: [{ publisher: 'USP', edition: 'Synthetic', entry: 'https://openphar.org/data/usp/synthetic/entry/example' }] }]))
  const args = ['scripts/generate-datasets.mjs', '--datasets', 'tp,thp', '--source', 'tp=input', '--source', 'thp=input', '--registry-dir', 'control']
  const run = () => {
    const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  run()
  // A second invocation reads the privacy-projected index (no restricted sub).
  run()
  const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
  const graph = read('data/tp/tp-monographs.jsonld')['@graph']
  assert.equal(graph.length, 3)
  assert.equal(new Set(graph.map(m => m['@id'])).size, 3)
  const chosen = graph.find(m => m['@id'].endsWith('/example'))
  assert.equal(chosen.edition, 'TP-new')
  assert.equal(chosen.definition.en, 'Public definition TP-new')
  assert.equal(chosen.prefLabel.th, 'ตัวอย่าง')
  assert.deepEqual(chosen.sections[1], { name: 'Source text', text: 'Public source text' })
  assert.equal(graph.find(m => m['@id'].endsWith('/unique')).category, 'appendices')
  assert.equal(graph.find(m => m['@id'].endsWith('/legacy')).edition, 'TP II 2011 (legacy extraction)')
  const search = read('data/search-index.json')
  assert.equal(search.find(m => m.d === 'tp' && m.s === 'example').n, 'ตัวอย่าง')
  assert.equal(search.find(m => m.d === 'thp').sub, undefined)
  assert.ok(read('data/cross-links.json')['us/example']?.some(e => e.d === 'tp' && e.s === 'example'), 'approved identity-only counterpart survives restricted search projection')
  const { nn, ...preservedSearch } = search.find(m => m.d === 'us')
  assert.deepEqual(preservedSearch, { d: 'us', s: 'example', c: 'monographs', t: 'Previously indexed example', x: '50-00-0', k: 0 })
  assert.equal(read('data/route-aliases.json').routes['/pharmacopoeia/thp/monographs/example'], '/pharmacopoeia/tp/monographs/example')
  const sub = read('data/substances/example.json')
  assert.deepEqual(sub.names, publicSub.names)
  assert.deepEqual(sub.entries.filter(e => e.d === 'us'), publicSub.entries.map(e => ({ ...e, t: existingSearchRow.t })))
  assert.equal(sub.entries.find(e => e.d === 'tp').edition, 'TP-new')
  assert.equal(fs.readFileSync(path.join(dir, 'data/us/us-monographs.jsonld'), 'utf8'), otherGraph)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data/downloads/substances.ndjson'), 'utf8')), sub)
  for (const file of ['data/tp/tp-monographs.jsonld', 'data/thp/thp-monographs.jsonld', 'data/search-index.json', 'data/substances/example.json']) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, file), 'utf8'), /PRIVATE_SENTINEL|reference-docs|bbox=/)
  }
  // Complete category/edition/source and ambiguity negatives are in public-identities.test.mjs.
  const registryFile = path.join(dir, 'registry/datasets.yml')
  const registryBytes = fs.readFileSync(registryFile, 'utf8')
  fs.writeFileSync(registryFile, registryBytes.replace('legacy_count: 2', 'legacy_count: 3'))
  const missingLegacy = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' })
  assert.notEqual(missingLegacy.status, 0)
  assert.match(missingLegacy.stderr, /Thai legacy source count changed/)
  fs.writeFileSync(registryFile, registryBytes)
  // Fresh restricted input containing a numbered section must still emit the
  // exact six-field public contract, rather than leaking monographId or text.
  const restrictedSource = doc('USP', 'Synthetic', 'restricted', 'Restricted example')
  restrictedSource.classification.section_id = '99'
  restrictedSource.monographId = '99'
  write('input/data/us/restricted.yaml', dump(restrictedSource))
  const restrictedRun = spawnSync(process.execPath, ['scripts/generate-datasets.mjs', '--datasets', 'us', '--source', 'us=input', '--registry-dir', 'control'], { cwd: dir, encoding: 'utf8' })
  assert.equal(restrictedRun.status, 0, restrictedRun.stderr)
  const restrictedEntry = read('data/us/us-monographs.jsonld')['@graph'][0]
  assert.deepEqual(Object.keys(restrictedEntry).sort(), ['@id', '@type', 'category', 'edition', 'prefLabel'].sort())
  assert.equal(restrictedEntry['@type'], 'TitleIndexEntry')
  // Restore the fixture's unrelated public graph before the repeat comparison.
  write('data/us/us-monographs.jsonld', otherGraph)
  const bytes = fs.readFileSync(path.join(dir, 'data/tp/tp-monographs.jsonld'))
  run()
  assert.deepEqual(fs.readFileSync(path.join(dir, 'data/tp/tp-monographs.jsonld')), bytes)
})
