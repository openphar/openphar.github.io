// Server/build-only access. Never import this module from a hydrated island.
import fs from 'node:fs'
import path from 'node:path'
// Astro bundles this module into its prerender directory; import.meta.url
// therefore cannot identify the original source tree. Native npm scripts run
// from the package root in local development and CI.
const root = process.cwd()
const data = path.join(root, 'data')
const cache = new Map()
export const sampleBuild = process.env.OPENPHAR_BUILD_SAMPLE === '1'

function read(relative) {
  if (!cache.has(relative)) cache.set(relative, JSON.parse(fs.readFileSync(path.join(data, relative), 'utf8')))
  return cache.get(relative)
}

export const registry = read('registry.json')
if (!Array.isArray(registry) || !registry.length) throw new Error('Empty vendored dataset registry')

export function isEntry(item) {
  const type = item['@type']
  const types = Array.isArray(type) ? type : (type ? [type] : [])
  return types.some(t => typeof t === 'string' && (t.endsWith('Monograph') || t === 'TitleIndexEntry')) ||
    (types.length === 0 && !!(item.prefLabel || item['rdfs:label']))
}

export function entrySlug(entry) { return (entry['@id'] || '').split('/').pop() }
export function entryCategory(entry) {
  return (typeof entry.category === 'string' && entry.category) ||
    ((entry['@id'] || '').match(/\/data\/[^/]+\/([^/]+)\//) || [])[1] || 'monographs'
}

export function entries(id) {
  const relative = `${id}/${id}-monographs.jsonld`
  if (!fs.existsSync(path.join(data, relative))) {
    if (registry.find(dataset => dataset.id === id)?.status === 'raw') return []
    throw new Error(`Missing vendored dataset ${id}`)
  }
  return (read(relative)['@graph'] || []).filter(isEntry)
}

export function datasetIds() {
  const vendored = fs.readdirSync(data).filter(id => fs.existsSync(path.join(data, id, `${id}-monographs.jsonld`)))
  return [...new Set([...registry.map(dataset => dataset.id), ...vendored])]
}

export function cardEntry(entry) {
  return Object.fromEntries(['@id', '@type', 'prefLabel', 'rdfs:label', 'category', 'edition']
    .filter(key => key in entry).map(key => [key, entry[key]]))
}

export function counterparts(id, slug) { return read('cross-links.json')[`${id}/${slug}`] || [] }
export function substanceSlugs() {
  const slugs = fs.readdirSync(path.join(data, 'substances')).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).sort()
  if (!slugs.length) throw new Error('Missing vendored substance pages')
  // Include one newly merged identity whose numbered Ph.Int. join must remain
  // tied to its edition, in addition to the original diagnostic sample.
  const editionJoinCase = 'rifampicin-isoniazid-pyrazinamide-and-ethambutol-hydrochloride-tablets'
  return sampleBuild ? [...new Set([...slugs.slice(0, 2), ...(slugs.includes(editionJoinCase) ? [editionJoinCase] : [])])] : slugs
}
export function substance(slug) { return read(`substances/${slug}.json`) }
