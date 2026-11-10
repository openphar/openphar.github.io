// Build budget gate: measure the built site in dist/ and compare it with the
// limits in scripts/build-budgets.json. A metric outside its min/max fails;
// a missing metric also fails (never skipped). Build time is measured by the
// workflow around `npm run build` and passed in with --build-seconds.
//
//   node scripts/check-build-budgets.mjs --build-seconds N [--dist dist] [--budgets FILE] [--out FILE]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

export function measureDist(dist) {
  let files = 0, bytes = 0, htmlPages = 0, dataFiles = 0
  let largest = { bytes: 0, path: '' }
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { walk(p, r); continue }
      if (!e.isFile()) continue
      const size = fs.statSync(p).size
      files++
      bytes += size
      if (e.name.endsWith('.html')) htmlPages++
      if (r.startsWith('data/')) dataFiles++
      if (size > largest.bytes) largest = { bytes: size, path: r }
    }
  }
  walk(dist, '')
  return { files, bytes, html_pages: htmlPages, data_files: dataFiles, largest_file: largest }
}

const dig = (obj, dotted) => dotted.split('.').reduce((o, k) => (o && typeof o === 'object' && k in o ? o[k] : undefined), obj)

export function checkBudgets(metrics, budgets) {
  return budgets.map(b => {
    const value = dig(metrics, b.metric)
    const problems = []
    if (typeof value !== 'number' || Number.isNaN(value)) problems.push('metric missing')
    else {
      if (b.min !== undefined && value < b.min) problems.push(`${value} < min ${b.min}`)
      if (b.max !== undefined && value > b.max) problems.push(`${value} > max ${b.max}`)
    }
    return { metric: b.metric, value: value ?? null, min: b.min ?? null, max: b.max ?? null, ok: problems.length === 0, problems }
  })
}

function main(argv) {
  const opts = { dist: path.join(ROOT, 'dist'), budgets: path.join(ROOT, 'scripts/build-budgets.json') }
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (value === undefined) throw new Error(`Missing value for ${flag}`)
    if (flag === '--build-seconds') opts.buildSeconds = Number(value)
    else if (flag === '--dist') opts.dist = path.resolve(value)
    else if (flag === '--budgets') opts.budgets = path.resolve(value)
    else if (flag === '--out') opts.out = path.resolve(value)
    else throw new Error(`Unknown argument: ${flag}`)
  }
  if (!fs.existsSync(opts.dist)) { console.error(`✗ build budgets: ${opts.dist} does not exist`); return 1 }
  const metrics = { build_seconds: opts.buildSeconds, dist: measureDist(opts.dist) }
  const { budgets } = JSON.parse(fs.readFileSync(opts.budgets, 'utf8'))
  const rows = checkBudgets(metrics, budgets)
  const passed = rows.every(r => r.ok)
  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify({ passed, metrics, rows }, null, 2) + '\n')
  for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} ${r.metric}: ${r.value}${r.min !== null ? ` (min ${r.min})` : ''}${r.max !== null ? ` (max ${r.max})` : ''}${r.ok ? '' : ` — ${r.problems.join('; ')}`}`)
  console.log(`${passed ? '✓' : '✗'} build budgets: ${rows.filter(r => r.ok).length}/${rows.length} within limits (largest file ${metrics.dist.largest_file.path})`)
  return passed ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
