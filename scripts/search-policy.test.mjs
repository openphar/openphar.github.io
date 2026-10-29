import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const allowed = new Set(['d', 's', 'c', 't', 'k', 'x'])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
function write(root, name, value) {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}
function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'search-policy-'))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const root = path.join(parent, 'hub')
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  for (const name of ['generate-datasets.mjs', 'search-policy.mjs', 'native-labels.mjs', 'registry-join.mjs', 'thai-editions.mjs', 'public-identities.mjs']) {
    fs.copyFileSync(path.join(ROOT, 'scripts', name), path.join(root, 'scripts', name))
  }
  if (process.env.BASELINE_GENERATOR) fs.copyFileSync(process.env.BASELINE_GENERATOR, path.join(root, 'scripts/generate-datasets.mjs'))
  fs.symlinkSync(fs.realpathSync(path.join(ROOT, 'node_modules')), path.join(root, 'node_modules'), 'dir')
  return root
}
function cli(root, args = ['--reindex-search']) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/generate-datasets.mjs'), ...args], { encoding: 'utf8' })
}
function ok(result) {
  // Only synthetic fixture errors are printed; vendored values stay out of logs.
  assert.equal(result.status, 0, 'producer CLI must succeed')
}
function snapshot(root) {
  const result = {}
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name)
      if (e.isDirectory()) walk(file)
      else result[path.relative(root, file)] = hash(fs.readFileSync(file))
    }
  }
  walk(path.join(root, 'data'))
  return result
}
function seed(root) {
  write(root, 'registry/datasets.yml', { datasets: { sealed: { rights: 'title-only' }, open: { rights: 'full' } } })
  write(root, 'data/registry.json', [{ id: 'sealed', rights: 'title-only', count: 1 }, { id: 'open', rights: 'full', count: 1 }])
  for (const d of ['sealed', 'open']) write(root, `data/${d}/${d}-monographs.jsonld`, { '@graph': [
    { '@id': `https://example.test/data/${d}/monographs/example`, '@type': 'IndexedMonograph', prefLabel: { en: 'Synthetic title' } }
  ] })
  write(root, 'data/search-index.json', ['sealed', 'open'].map(d => ({
    d, s: 'example', c: 'monographs', t: 'Synthetic title', k: d === 'sealed' ? 0 : 1, x: '50-00-0',
    sub: 'synthetic-identity', n: 'SYNTHETIC_ALIAS', l: 'test', nn: 'SYNTHETIC_POOL', future: { marker: true }
  })))
  write(root, 'data/cross-links.json', { sentinel: true })
  // This would fail parsing if the CLI loaded the private sibling before dispatch.
  fs.mkdirSync(path.join(root, '../substance-registry/registry'), { recursive: true })
  fs.writeFileSync(path.join(root, '../substance-registry/registry/entry-to-substance.json'), 'unreadable JSON sentinel')
}
function assertProjection(before, after, datasets) {
  assert.equal(after.length, before.length)
  for (let i = 0; i < before.length; i++) {
    const expected = datasets[before[i].d].rights === 'title-only'
      ? Object.fromEntries(Object.entries(before[i]).filter(([key]) => allowed.has(key))) : before[i]
    // Compare serialized field bytes as well as values/order for each row.
    assert.equal(JSON.stringify(after[i]), JSON.stringify(expected), `projection mismatch at row ${i}`)
  }
}

test('actual reindex projects all restricted fields by config and preserves unrelated bytes', t => {
  const root = fixture(t)
  seed(root)
  const before = read(root, 'data/search-index.json')
  const files = snapshot(root)
  ok(cli(root))
  assertProjection(before, read(root, 'data/search-index.json'), read(root, 'registry/datasets.yml').datasets)
  const after = snapshot(root)
  delete files['data/search-index.json']
  delete after['data/search-index.json']
  assert.deepEqual(after, files)
  const first = fs.readFileSync(path.join(root, 'data/search-index.json'))
  ok(cli(root))
  assert.deepEqual(fs.readFileSync(path.join(root, 'data/search-index.json')), first)
})

test('actual reindex fails closed before any write on invalid vendored inputs', async t => {
  const cases = {
    'missing policy': r => fs.unlinkSync(path.join(r, 'registry/datasets.yml')),
    'empty policy': r => write(r, 'registry/datasets.yml', { datasets: {} }),
    'unknown rights': r => write(r, 'registry/datasets.yml', { datasets: { sealed: { rights: 'unknown' } } }),
    'empty index': r => write(r, 'data/search-index.json', []),
    'missing index': r => fs.unlinkSync(path.join(r, 'data/search-index.json')),
    'missing registry': r => fs.unlinkSync(path.join(r, 'data/registry.json')),
    'empty registry': r => write(r, 'data/registry.json', []),
    'incomplete registry': r => write(r, 'data/registry.json', read(r, 'data/registry.json').slice(1)),
    'empty dataset': r => { const registry = read(r, 'data/registry.json'); registry[0].count = 0; write(r, 'data/registry.json', registry) },
    'missing graph': r => fs.unlinkSync(path.join(r, 'data/sealed/sealed-monographs.jsonld')),
    'empty graph': r => write(r, 'data/sealed/sealed-monographs.jsonld', { '@graph': [] }),
    'unknown dataset row': r => { const rows = read(r, 'data/search-index.json'); rows[1].d = 'unknown'; write(r, 'data/search-index.json', rows) },
    'invalid last row': r => { const rows = read(r, 'data/search-index.json'); rows[1].t = ''; write(r, 'data/search-index.json', rows) },
    'wrong rights marker': r => { const rows = read(r, 'data/search-index.json'); rows[0].k = 1; write(r, 'data/search-index.json', rows) },
    'invalid CAS': r => { const rows = read(r, 'data/search-index.json'); rows[0].x = {}; write(r, 'data/search-index.json', rows) },
    'missing row': r => write(r, 'data/search-index.json', read(r, 'data/search-index.json').slice(1)),
    'extra row': r => { const rows = read(r, 'data/search-index.json'); rows.push(rows[0]); write(r, 'data/search-index.json', rows) },
    'wrong route': r => { const rows = read(r, 'data/search-index.json'); rows[0].c = 'wrong'; write(r, 'data/search-index.json', rows) }
  }
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, t => {
    const root = fixture(t)
    seed(root)
    mutate(root)
    const before = snapshot(root)
    assert.notEqual(cli(root).status, 0)
    assert.deepEqual(snapshot(root), before)
  })
})

test('normal producer retains identity-only crosslinks and alias pooling before publication projection', t => {
  const root = fixture(t)
  const datasets = {
    sealed: { rights: 'title-only', short: 'Synthetic', edition: '1', generate: { repo: '../source', glob: 'entries/*.yaml', mode: 'titles' } },
    jp: { rights: 'full', edition: 'JP18' }
  }
  write(root, 'registry/datasets.yml', { datasets })
  const canonical = 'https://example.test/corpus/synthetic'
  write(root, '../source/entries/example.yaml', { canonical_iri: canonical, title: { english: 'Synthetic restricted title' } })
  write(root, 'data/jp/jp-monographs.jsonld', { '@graph': [{
    '@id': 'https://www.openphar.org/data/jp/monographs/open-example', '@type': 'IndexedMonograph',
    prefLabel: { en: 'Different synthetic title', ja: 'SYNTHETIC_ALIAS_SENTINEL' }
  }] })
  write(root, '../substance-registry/registry/entry-to-substance.json', {
    [canonical]: 'synthetic-identity',
    'https://www.openphar.org/data/jp/monographs/open-example': 'synthetic-identity'
  })
  write(root, '../substance-registry/registry/substances.json', [{ id: 'synthetic-identity', canonical_iri: 'https://openphar.org/substance/synthetic-identity' }])
  ok(cli(root, []))
  const rows = read(root, 'data/search-index.json')
  const restricted = rows.find(r => r.d === 'sealed')
  assert.ok(restricted)
  assert.deepEqual(Object.keys(restricted).filter(key => !allowed.has(key)), [])
  assert.equal(rows.find(r => r.d === 'jp').sub, 'synthetic-identity')
  assert.equal(rows.find(r => r.d === 'jp').n, 'SYNTHETIC_ALIAS_SENTINEL')
  const links = read(root, 'data/cross-links.json')
  assert.equal(links['sealed/synthetic'][0].d, 'jp')
  assert.equal(links['jp/open-example'][0].d, 'sealed')
  assert.equal(read(root, 'data/substances/synthetic-identity.json').entries.length, 2)
  // Change the vendored dataset's policy too: its native n/l must disappear,
  // while its native alias still participates in internal pooling.
  datasets.jp.rights = 'title-only'
  write(root, 'registry/datasets.yml', { datasets })
  ok(cli(root, []))
  for (const row of read(root, 'data/search-index.json')) assert.deepEqual(Object.keys(row).filter(k => !allowed.has(k)), [])
  assert.equal(read(root, 'data/substances/synthetic-identity.json').entries.length, 2)
})

test('actual vendored index retains all rows and unrestricted field bytes under native reindex', t => {
  const root = fixture(t)
  fs.cpSync(path.join(ROOT, 'registry'), path.join(root, 'registry'), { recursive: true })
  fs.mkdirSync(path.join(root, 'data'), { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'data/registry.json'), path.join(root, 'data/registry.json'))
  const registry = read(root, 'data/registry.json')
  for (const { id } of registry) {
    const name = `${id}/${id}-monographs.jsonld`
    fs.mkdirSync(path.dirname(path.join(root, 'data', name)), { recursive: true })
    fs.copyFileSync(path.join(ROOT, 'data', name), path.join(root, 'data', name))
  }
  const rows = read(ROOT, 'data/search-index.json')
  const datasets = Object.fromEntries(registry.map(r => [r.id, r]))
  // Synthetic legacy alias guarantees this remains an old-red test after repair.
  const restricted = rows.find(r => datasets[r.d].rights === 'title-only')
  Object.assign(restricted, { sub: 'SYNTHETIC_ID', n: 'SYNTHETIC_ALIAS', l: 'test', nn: 'SYNTHETIC_POOL' })
  write(root, 'data/search-index.json', rows)
  const before = snapshot(root)
  ok(cli(root))
  assertProjection(rows, read(root, 'data/search-index.json'), datasets)
  const after = snapshot(root)
  delete before['data/search-index.json']
  delete after['data/search-index.json']
  assert.deepEqual(after, before)
})
