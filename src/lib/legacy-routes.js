// Build-time route sets that keep formerly public URLs alive in the static site.
// The previous vite-ssg build emitted a page for every route-aliases.json key
// and every substance-history.json key; the Astro migration dropped both.
import fs from 'node:fs'
import path from 'node:path'

function readJson(dataDir, relative, fallback) {
  const file = path.join(dataDir, relative)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback
}

// Alias URL -> target URL, excluding aliases that a real entry page already owns.
export function legacyPharmacopoeiaAliases(dataDir, realPaths = new Set()) {
  const routes = readJson(dataDir, 'route-aliases.json', { routes: {} }).routes || {}
  return Object.entries(routes)
    .filter(([from, to]) => typeof to === 'string' && from !== to && !realPaths.has(from))
    .sort(([a], [b]) => a.localeCompare(b))
}

// Retired substance slugs (redirect or withdrawn) that have no current page.
export function historicalSubstanceSlugs(dataDir, currentSlugs) {
  const current = new Set(currentSlugs)
  return Object.keys(readJson(dataDir, 'substance-history.json', {})).filter(slug => !current.has(slug)).sort()
}
