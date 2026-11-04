import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { dump } from 'js-yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPTS = ['generate-datasets.mjs', 'native-labels.mjs', 'thai-editions.mjs', 'registry-join.mjs', 'search-policy.mjs', 'public-identities.mjs', 'source-route-slugs.mjs', 'entry-routes.mjs', 'lib/ich-method-projection.mjs']

// Synthetic KP tree: a part2 monograph "Capsules" and a general-requirements
// dosage-forms chapter "Capsules" both slugify to "capsules".
function generate(withMonograph = true) {
  const local = path.join(ROOT, '.local')
  fs.mkdirSync(local, { recursive: true })
  const dir = fs.mkdtempSync(path.join(local, 'kp-route-'))
  const write = (name, data) => { const f = path.join(dir, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data) }
  for (const file of SCRIPTS) write(`scripts/${file}`, fs.readFileSync(path.join(ROOT, 'scripts', file)))
  const monograph = slug => ({ canonical_iri: `https://openphar.org/data/kp/kp13/ko/monograph/${slug}`, publisher: 'KP', edition: 'KP13', language: 'ko',
    names: { ko: '캡슐', en: 'Capsules' }, definition: 'Monograph definition', sections: [{ key: 'storage', label: 'Storage', text: 'Monograph storage' }] })
  if (withMonograph) write('input/data/KP13/ko/yaml/monograph/part2/capsules.yaml', dump(monograph('capsules')))
  write('input/data/KP13/ko/yaml/monograph/part2/other.yaml', dump({ ...monograph('other'), names: { ko: '기타', en: 'Other' } }))
  write('input/data/KP13/ko/yaml/general-requirements/general-requirements.yaml', dump({ language: 'ko', chapters: [
    { title_ko: '캡슐제', title_en: 'Capsules', number: '3', clauses: [{ label: 'a', text: 'Dosage form clause' }] }] }))
  write('registry/datasets.yml', dump({ datasets: { kp: { short: 'KP', name: 'KP', rights: 'full', edition: 'KP13', generate: {
    repo: 'unused', glob: 'data/KP13/ko/yaml/monograph/**/*.yaml', mode: 'full', corpora: { globs: ['data/KP13/ko/yaml/general-requirements/*.yaml'] } } } } }))
  write('control/entry-to-substance.json', '{}')
  const r = spawnSync(process.execPath, ['scripts/generate-datasets.mjs', '--datasets', 'kp', '--source', 'kp=input', '--registry-dir', 'control'], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const graph = JSON.parse(fs.readFileSync(path.join(dir, 'data/kp/kp-monographs.jsonld'), 'utf8'))['@graph']
  fs.rmSync(dir, { recursive: true, force: true })
  return graph
}

test('KP monograph and dosage-form chapter with the same title keep distinct @id and stable published route', () => {
  const graph = generate()
  const ids = graph.map(m => m['@id'])
  assert.equal(new Set(ids).size, ids.length, 'every @id is unique')
  const chapter = graph.find(m => m.category === 'dosage-forms')
  // the already-published general-chapter route is unchanged
  assert.equal(chapter['@id'], 'https://www.openphar.org/data/kp/monographs/capsules')
  const mono = graph.find(m => m.category === 'part2' && m.prefLabel.en === 'Capsules')
  assert.match(mono['@id'], /^https:\/\/www\.openphar\.org\/data\/kp\/monographs\/capsules--[0-9a-f]{16}$/)
  // non-colliding source rows keep their plain slug
  assert.equal(graph.find(m => m.prefLabel.en === 'Other')['@id'], 'https://www.openphar.org/data/kp/monographs/other')
})

test('without a collision the monograph keeps its plain slug', () => {
  const graph = generate(false)
  assert.equal(graph.filter(m => m['@id'].endsWith('/capsules')).length, 1)
  assert.ok(!graph.some(m => m['@id'].includes('--')))
})
