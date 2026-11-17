// Uptime check for the public site: request a few key routes and fail when a
// route does not answer 200 or its body lacks the expected content. Run on a
// schedule by .github/workflows/uptime.yml; read-only GETs, no secrets.
//
//   node scripts/check-uptime.mjs [--base https://www.openphar.org] [--retries 1] [--retry-delay 30] [--timeout 30]
//
// A route that fails is retried (default once, after 30 s) so a single network
// blip does not fail the run. Redirects are not followed: every route below is
// the canonical URL and must answer 200 itself.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_BASE = 'https://www.openphar.org'

const hasTitle = title => body => body.includes(`<title>${title}`) || `missing <title>${title}…`

export const ROUTES = [
  { path: '/', why: 'home page', check: hasTitle('Open Pharmacopoeia') },
  { path: '/compare/', why: 'compare page', check: hasTitle('Compare Monographs') },
  { path: '/substance/caffeine/', why: 'substance page', check: hasTitle('Caffeine') },
  { path: '/pharmacopoeia/jp/', why: 'dataset page', check: hasTitle('Japanese Pharmacopoeia') },
  {
    path: '/data/registry.json', why: 'dataset registry',
    check: body => {
      const registry = JSON.parse(body)
      if (!Array.isArray(registry) || registry.length === 0) return 'registry is not a non-empty array'
      return registry.some(d => d && d.id === 'jp') || 'registry has no "jp" dataset'
    }
  },
  {
    path: '/data/downloads/substances.ndjson', why: 'substance dataset download',
    check: body => {
      const lines = body.split('\n').filter(l => l.trim())
      if (lines.length < 1000) return `only ${lines.length} records (expected at least 1000)`
      for (const [i, line] of lines.entries()) {
        let rec
        try { rec = JSON.parse(line) } catch { return `line ${i + 1} is not JSON` }
        if (!rec || typeof rec.id !== 'string' || typeof rec.iri !== 'string') return `line ${i + 1} has no id/iri`
      }
      return true
    }
  }
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// One attempt: returns null when the route is up, otherwise the problem.
export async function probe(base, route, { fetchImpl = fetch, timeoutSeconds = 30 } = {}) {
  const url = new URL(route.path, base).href
  let res
  try {
    res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutSeconds * 1000), headers: { 'user-agent': 'openphar-uptime-check' } })
  } catch (err) {
    return `request failed: ${err.cause?.code || err.name}: ${err.message}`
  }
  if (res.status !== 200) return `HTTP ${res.status}${res.headers?.get?.('location') ? ` -> ${res.headers.get('location')}` : ''}`
  let verdict
  try { verdict = route.check(await res.text()) } catch (err) { verdict = `content check threw: ${err.message}` }
  return verdict === true ? null : verdict
}

export async function checkRoutes(base, routes, { retries = 1, retryDelaySeconds = 30, ...opts } = {}) {
  const results = []
  for (const route of routes) {
    const started = Date.now()
    let problem = await probe(base, route, opts)
    let attempts = 1
    while (problem && attempts <= retries) {
      if (retryDelaySeconds > 0) await sleep(retryDelaySeconds * 1000)
      problem = await probe(base, route, opts)
      attempts++
    }
    results.push({ path: route.path, why: route.why, ok: !problem, problem, attempts, ms: Date.now() - started })
  }
  return results
}

async function main(argv) {
  const opts = { base: DEFAULT_BASE, retries: 1, retryDelaySeconds: 30, timeoutSeconds: 30 }
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (value === undefined) throw new Error(`Missing value for ${flag}`)
    if (flag === '--base') opts.base = value
    else if (flag === '--retries') opts.retries = Number(value)
    else if (flag === '--retry-delay') opts.retryDelaySeconds = Number(value)
    else if (flag === '--timeout') opts.timeoutSeconds = Number(value)
    else throw new Error(`Unknown argument: ${flag}`)
  }
  const results = await checkRoutes(opts.base, ROUTES, opts)
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.path} (${r.why}) ${r.ms} ms${r.attempts > 1 ? `, ${r.attempts} attempts` : ''}${r.ok ? '' : ` — ${r.problem}`}`)
  }
  const up = results.filter(r => r.ok).length
  console.log(`${up === results.length ? '✓' : '✗'} uptime: ${up}/${results.length} routes up at ${opts.base}`)
  return up === results.length ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2))
}
