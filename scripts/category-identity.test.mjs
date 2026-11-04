import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { findRouteEntry } from './entry-routes.mjs'
const ROOT = path.resolve(import.meta.dirname, '..')

// BP shape: one source document may be filed under several categories and
// editions with the same slug. Route identity is (category, slug); @id must
// carry the category (CLAUDE.md: /data/{publisher}/{category}/{slug}).
function run(t, identity, extraRows = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'category-identity-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (file, value) => { const p = path.join(root, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value)) }
  for (const name of ['generate-datasets', 'native-labels', 'thai-editions', 'registry-join', 'search-policy', 'public-identities', 'source-route-slugs', 'entry-routes']) write(`scripts/${name}.mjs`, fs.readFileSync(path.join(ROOT, `scripts/${name}.mjs`), 'utf8'))
  write('scripts/lib/ich-method-projection.mjs', fs.readFileSync(path.join(ROOT, 'scripts/lib/ich-method-projection.mjs'), 'utf8'))
  fs.symlinkSync(fs.realpathSync(path.join(ROOT, 'node_modules')), path.join(root, 'node_modules'), 'dir')
  write('registry/datasets.yml', { datasets: { uk: { short: 'BP', edition: 'BP 2025', rights: 'title-only', ...(identity ? { identity } : {}), generate: { repo: 'uk', glob: 'data/bp/**/*.yaml', mode: 'titles' } } } })
  const rows = [
    ['medicinal-and-pharmaceutical-substances', '2025-BP', 'amoxicillin-trihydrate'],
    ['veterinary', '2025-BP', 'amoxicillin-trihydrate'],
    ['appendices', '2023-BP', 'ammonia-solution'],
    ['appendix-01', '2023-BP', 'ammonia-solution'],
    ['infrared-spectra', '2023-BP', 'mitobronitol'],
    ['medicinal-and-pharmaceutical-substances', '2025-BP', 'mitobronitol'],
    ...extraRows
  ]
  for (const [dir, edition, slug, category = dir] of rows) write(`uk/data/bp/${dir}/${slug}.yaml`, `canonical_iri: https://openphar.org/data/bp/entry/${slug}\ncategory: ${category}\nedition: ${edition}\ntitle: ${slug}\nnames:\n  en: Title ${slug}\n`)
  const p = spawnSync(process.execPath, ['scripts/generate-datasets.mjs', '--registry-dir', 'no-private-registry'], { cwd: root, encoding: 'utf8' })
  const graphFile = path.join(root, 'data/uk/uk-monographs.jsonld')
  return { p, graph: fs.existsSync(graphFile) ? JSON.parse(fs.readFileSync(graphFile, 'utf8'))['@graph'] : null, root }
}

test('legacy ids collide for same-slug entries in different categories (old red)', t => {
  const { p, graph } = run(t, null)
  assert.equal(p.status, 0, p.stderr)
  assert.equal(graph.length, 6)
  assert.equal(new Set(graph.map(x => x['@id'])).size, 3)
})
test('identity: category gives every entry a unique category-qualified @id and keeps routes (new green)', t => {
  const { p, graph, root } = run(t, 'category')
  assert.equal(p.status, 0, p.stderr)
  assert.equal(graph.length, 6)
  assert.equal(new Set(graph.map(x => x['@id'])).size, 6)
  for (const entry of graph) assert.equal(entry['@id'], `https://www.openphar.org/data/uk/${entry.category}/${entry['@id'].split('/').pop()}`)
  // published page route = /pharmacopoeia/uk/{category}/{slug}: unchanged, each resolves to its own entry
  for (const entry of graph) assert.equal(findRouteEntry(graph, entry.category, entry['@id'].split('/').pop()), entry)
  assert.deepEqual(graph.map(x => Object.keys(x).sort()).filter(k => k.join() !== ['@id', '@type', 'category', 'edition', 'prefLabel'].join()), [])
  const index = JSON.parse(fs.readFileSync(path.join(root, 'data/search-index.json'), 'utf8')).filter(x => x.d === 'uk')
  assert.equal(new Set(index.map(x => `${x.c}/${x.s}`)).size, 6)
})
test('identity: category fails shut on a true duplicate and never suffixes or dedupes', t => {
  // same category and slug from two source files: no route can tell them apart
  const { p, graph } = run(t, 'category', [['veterinary-copy', '2023-BP', 'amoxicillin-trihydrate', 'veterinary']])
  assert.notEqual(p.status, 0)
  assert.match(p.stderr, /Duplicate uk hub identity/)
  assert.equal(graph, null)
})
