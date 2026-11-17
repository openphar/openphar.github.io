import test from 'node:test'
import assert from 'node:assert/strict'
import { ROUTES, checkRoutes, probe } from './check-uptime.mjs'

// Offline: a fake fetch serves canned responses, so these tests never touch the network.
const ndjson = Array.from({ length: 1000 }, (_, i) => JSON.stringify({ id: `s${i}`, iri: `https://openphar.org/substance/s${i}` })).join('\n') + '\n'
const healthy = {
  '/': '<title>Open Pharmacopoeia — one semantic structure</title>',
  '/compare/': '<title>Compare Monographs — Open Pharmacopoeia</title>',
  '/substance/caffeine/': '<title>Caffeine — Open Pharmacopoeia</title>',
  '/pharmacopoeia/jp/': '<title>Japanese Pharmacopoeia — Open Pharmacopoeia</title>',
  '/data/registry.json': JSON.stringify([{ id: 'jp' }, { id: 'us' }]),
  '/data/downloads/substances.ndjson': ndjson
}

function fakeFetch(site, calls = []) {
  return async (url, init) => {
    calls.push({ url, init })
    const entry = site[new URL(url).pathname]
    if (entry instanceof Error) throw entry
    const { status = 200, body = '', location } = typeof entry === 'string' ? { body: entry } : (entry || { status: 404 })
    return { status, headers: new Map(location ? [['location', location]] : []), text: async () => body }
  }
}

const BASE = 'https://www.openphar.org'
const run = (site, opts = {}) => checkRoutes(BASE, ROUTES, { fetchImpl: fakeFetch(site, opts.calls), retryDelaySeconds: 0, ...opts })

test('every route passes against a healthy site, without retries', async () => {
  const calls = []
  const results = await run(healthy, { calls })
  assert.deepEqual(results.filter(r => !r.ok), [])
  assert.equal(calls.length, ROUTES.length)
  for (const c of calls) assert.equal(c.init.redirect, 'manual', 'redirects must not be followed')
})

test('covers home, a compare page and a dataset download', () => {
  const paths = ROUTES.map(r => r.path)
  for (const p of ['/', '/compare/', '/data/downloads/substances.ndjson']) assert.ok(paths.includes(p), p)
})

test('non-200 fails, including redirects', async () => {
  const results = await run({ ...healthy, '/compare/': { status: 301, location: '/elsewhere/' }, '/substance/caffeine/': { status: 404 } })
  const bad = Object.fromEntries(results.filter(r => !r.ok).map(r => [r.path, r.problem]))
  assert.deepEqual(Object.keys(bad).sort(), ['/compare/', '/substance/caffeine/'])
  assert.match(bad['/compare/'], /HTTP 301 -> \/elsewhere\//)
  assert.match(bad['/substance/caffeine/'], /HTTP 404/)
})

test('200 with missing expected content fails', async () => {
  const results = await run({
    ...healthy,
    '/': '<title>Site not found · GitHub Pages</title>',
    '/data/registry.json': '[{"id":"us"}]',
    '/data/downloads/substances.ndjson': ndjson.replace('"id":"s5"', '"name":"s5"')
  })
  const bad = Object.fromEntries(results.filter(r => !r.ok).map(r => [r.path, r.problem]))
  assert.match(bad['/'], /missing <title>Open Pharmacopoeia/)
  assert.match(bad['/data/registry.json'], /no "jp"/)
  assert.match(bad['/data/downloads/substances.ndjson'], /line 6 has no id\/iri/)
  assert.equal(Object.keys(bad).length, 3)
})

test('truncated download and invalid JSON fail', async () => {
  const results = await run({ ...healthy, '/data/downloads/substances.ndjson': ndjson.split('\n').slice(0, 10).join('\n'), '/data/registry.json': '<html>' })
  const bad = Object.fromEntries(results.filter(r => !r.ok).map(r => [r.path, r.problem]))
  assert.match(bad['/data/downloads/substances.ndjson'], /only 10 records/)
  assert.match(bad['/data/registry.json'], /content check threw/)
})

test('a network error is retried, and passes if the retry succeeds', async () => {
  let n = 0
  const flaky = async (url, init) => {
    if (new URL(url).pathname === '/' && n++ === 0) throw new TypeError('fetch failed')
    return fakeFetch(healthy)(url, init)
  }
  const [home] = await checkRoutes(BASE, ROUTES.slice(0, 1), { fetchImpl: flaky, retryDelaySeconds: 0 })
  assert.equal(home.ok, true)
  assert.equal(home.attempts, 2)
})

test('a persistent failure is reported after the configured retries', async () => {
  const calls = []
  const [home] = await checkRoutes(BASE, ROUTES.slice(0, 1), { fetchImpl: fakeFetch({ '/': new TypeError('fetch failed') }, calls), retries: 2, retryDelaySeconds: 0 })
  assert.equal(home.ok, false)
  assert.equal(home.attempts, 3)
  assert.equal(calls.length, 3)
  assert.match(home.problem, /request failed/)
})

test('probe builds URLs from the base', async () => {
  const calls = []
  assert.equal(await probe('http://localhost:4321', ROUTES[1], { fetchImpl: fakeFetch(healthy, calls) }), null)
  assert.equal(calls[0].url, 'http://localhost:4321/compare/')
})
