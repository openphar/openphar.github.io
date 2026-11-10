import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { checkBudgets, measureDist } from './check-build-budgets.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'scripts/check-build-budgets.mjs')
const roots = []
test.after(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-budgets-'))
  roots.push(root)
  const files = { 'dist/index.html': '<p>x</p>', 'dist/a/index.html': '<p>yy</p>', 'dist/data/registry.json': '[]', 'dist/data/us/us.jsonld': '{"a":1}' }
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), body)
  }
  return root
}

const run = (root, budgets, seconds = '10') => {
  fs.writeFileSync(path.join(root, 'budgets.json'), JSON.stringify({ budgets }))
  return spawnSync(process.execPath, [SCRIPT, '--build-seconds', seconds, '--dist', path.join(root, 'dist'), '--budgets', path.join(root, 'budgets.json')], { encoding: 'utf8' })
}

test('measureDist counts files, bytes, pages, data files and the largest file', () => {
  const m = measureDist(path.join(fixture(), 'dist'))
  assert.deepEqual({ ...m, largest_file: m.largest_file.path }, { files: 4, bytes: 26, html_pages: 2, data_files: 2, largest_file: 'a/index.html' })
})

test('budgets inside their limits pass', () => {
  const r = run(fixture(), [{ metric: 'build_seconds', max: 60 }, { metric: 'dist.files', min: 4, max: 4 }, { metric: 'dist.largest_file.bytes', max: 100 }])
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('over max, under min, a missing metric and a missing build time all fail', () => {
  const root = fixture()
  assert.equal(run(root, [{ metric: 'dist.html_pages', max: 1 }]).status, 1)
  assert.equal(run(root, [{ metric: 'dist.data_files', min: 3 }]).status, 1)
  assert.equal(run(root, [{ metric: 'dist.no_such_metric', max: 1 }]).status, 1)
  assert.equal(run(root, [{ metric: 'build_seconds', max: 60 }], 'not-a-number').status, 1)
  assert.deepEqual(checkBudgets({}, [{ metric: 'build_seconds', max: 1 }])[0].problems, ['metric missing'])
})

test('a missing dist directory fails', () => {
  const root = fixture()
  fs.rmSync(path.join(root, 'dist'), { recursive: true })
  assert.equal(run(root, [{ metric: 'dist.files', min: 1 }]).status, 1)
})
