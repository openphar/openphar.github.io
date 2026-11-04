import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { legacyPharmacopoeiaAliases, historicalSubstanceSlugs } from '../src/lib/legacy-routes.js'

const data = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data')

test('synthetic data: aliases skip real pages, retired slugs skip current pages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-routes-'))
  fs.writeFileSync(path.join(dir, 'route-aliases.json'), JSON.stringify({ routes: { '/pharmacopoeia/a/b/old': '/pharmacopoeia/c/b/new', '/pharmacopoeia/a/b/real': '/pharmacopoeia/c/b/x' } }))
  fs.writeFileSync(path.join(dir, 'substance-history.json'), JSON.stringify({ gone: { status: 'redirect', target: 'now' }, now: {}, old: { status: 'withdrawn' } }))
  assert.deepEqual(legacyPharmacopoeiaAliases(dir, new Set(['/pharmacopoeia/a/b/real'])), [['/pharmacopoeia/a/b/old', '/pharmacopoeia/c/b/new']])
  assert.deepEqual(historicalSubstanceSlugs(dir, ['now']), ['gone', 'old'])
})

test('vendored data: dropped Thai, ICH and retired-substance routes are in the route set', () => {
  const aliases = new Map(legacyPharmacopoeiaAliases(data))
  assert.ok(aliases.has('/pharmacopoeia/ich/annexes/r1'))
  assert.equal(aliases.get('/pharmacopoeia/thp/monographs/acyclovir'), '/pharmacopoeia/tp/monographs/acyclovir')
  assert.equal([...aliases.keys()].filter(k => k.startsWith('/pharmacopoeia/thp/monographs/')).length, 91)
  const current = fs.readdirSync(path.join(data, 'substances')).map(f => f.slice(0, -5))
  const retired = historicalSubstanceSlugs(data, current)
  for (const slug of ['acyclovir', 'aucklandia-root', 'achyranthes-bidentata-root', 'aconiti-lateralis-radix-unprocessed']) assert.ok(retired.includes(slug), slug)
  assert.equal(retired.length, 24)
})
