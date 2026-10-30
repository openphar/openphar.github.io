import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { sourceRouteSlugs } from './source-route-slugs.mjs'
import { findRouteEntry, counterpartKey } from './entry-routes.mjs'
const ROOT = path.resolve(import.meta.dirname, '..')

test('source-derived slugs are deterministic and reject duplicate source identities', () => {
  const rows = [1, 2].map(n => ({ doc: { canonical_iri: `https://openphar.org/data/ich/q4b/annex/${n}/r1` } }))
  const a = sourceRouteSlugs(rows, () => 'r1'), b = sourceRouteSlugs([...rows].reverse(), () => 'r1')
  assert.equal(new Set(a.values()).size, 2)
  for (const row of rows) assert.equal(a.get(row), b.get(row))
  assert.throws(() => sourceRouteSlugs([rows[0], rows[0]], () => 'r1'), /Duplicate source identity/)
})
test('category-qualified live routes select their own records and ambiguous tuples fail shut', () => {
  const entries = ['formulations', 'ingredients'].map(category => ({ '@id': `https://www.openphar.org/data/ayp/${category}/guggulu`, category, prefLabel: { en: category } }))
  for (const entry of entries) assert.equal(findRouteEntry(entries, entry.category, 'guggulu'), entry)
  assert.equal(findRouteEntry(entries, undefined, 'guggulu'), null)
  assert.equal(findRouteEntry(entries, 'missing', 'guggulu'), null)
  assert.notEqual(counterpartKey('ayp', 'ingredients', 'guggulu'), counterpartKey('ayp', 'formulations', 'guggulu'))
  assert.equal(counterpartKey('us', 'monographs', 'example'), 'us/example')
})
test('native generator retains distinct AYP and ICH source identities and legacy URLs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-routes-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (file, value) => { const p = path.join(root, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value)) }
  for (const name of ['generate-datasets','native-labels','thai-editions','registry-join','search-policy','public-identities','source-route-slugs','entry-routes']) write(`scripts/${name}.mjs`, fs.readFileSync(path.join(ROOT, `scripts/${name}.mjs`), 'utf8'))
  fs.symlinkSync(fs.realpathSync(path.join(ROOT, 'node_modules')), path.join(root, 'node_modules'), 'dir')
  write('registry/datasets.yml', { datasets: {
    ayp: { short: 'API', edition: 'API', rights: 'full', generate: { repo: 'ayp', glob: 'data/**/*.yaml', mode: 'full' } },
    ich: { short: 'ICH Q4', edition: 'Q4B', rights: 'full', generate: { repo: 'ich', kind: 'ich-methods', file: 'methods.yaml', docs_globs: ['data/*.yaml'] } }
  } })
  for (const [kind, category] of [['ingredient', 'ingredients'], ['formulation', 'formulations']]) write(`ayp/data/${category}/example.yaml`, { canonical_iri: `https://openphar.org/data/api/${kind}/guggulu`, category, names: { en: `Guggulu ${kind}` } })
  write('ich/methods.yaml', [])
  for (const n of [1, 2]) write(`ich/data/annex-${n}.yaml`, { canonical_iri: `https://openphar.org/data/ich/q4b/annex/${n}/r1`, document_type: 'q4b_annex', title: `Annex ${n}`, code: `Q4B Annex ${n}(R1)` })
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file)))
  const generate = () => {
    const p = spawnSync(process.execPath, ['scripts/generate-datasets.mjs', '--registry-dir', 'no-private-registry'], { cwd: root, encoding: 'utf8' })
    assert.equal(p.status, 0, p.stderr)
    // Refreshing another dataset previously collapsed all shared r1 rows to
    // the last cached title, even though the source graph titles differed.
    const selected = spawnSync(process.execPath, ['scripts/generate-datasets.mjs', '--datasets', 'ayp', '--registry-dir', 'no-private-registry'], { cwd: root, encoding: 'utf8' })
    assert.equal(selected.status, 0, selected.stderr)
    assert.deepEqual(read('data/search-index.json').filter(x => x.d === 'ich').map(x => x.t).sort(), ['Annex 1', 'Annex 2'])
    const ayp = read('data/ayp/ayp-monographs.jsonld')['@graph'], ich = read('data/ich/ich-monographs.jsonld')['@graph']
    assert.equal(ayp.length, 2); assert.equal(ich.length, 2)
    assert.equal(new Set(ayp.map(x => x['@id'])).size, 2)
    assert.equal(new Set(ich.map(x => x['@id'])).size, 2)
    for (const category of ['ingredients', 'formulations']) assert.equal(findRouteEntry(ayp, category, 'guggulu')?.category, category)
    const annex1 = ich.find(x => x.monographId === 'Q4B Annex 1(R1)')
    assert.equal(read('data/route-aliases.json').routes['/pharmacopoeia/ich/annexes/r1'], '/pharmacopoeia/ich/annexes/' + annex1['@id'].split('/').pop())
    assert.deepEqual(read('data/search-index.json').filter(x => x.d === 'ayp').map(x => `${x.c}/${x.s}`).sort(), ['formulations/guggulu', 'ingredients/guggulu'])
    return { ayp, ich, aliases: read('data/route-aliases.json') }
  }
  const first = generate(); assert.deepEqual(generate(), first)
})
