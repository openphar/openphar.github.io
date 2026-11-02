import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readComparisonProjection, resolveEntrySelection, publicEntryCategory } from '../src/lib/comparison-contract.js'
import { readEditionProjection } from '../src/lib/edition-diff.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const WHO_LICENSE = 'https://creativecommons.org/licenses/by-nc-sa/3.0/igo/'
const fail = reason => { throw new Error(`Comparison publication gate: ${reason}`) }
export function validatePublicProjections(factsDocument, editionsDocument, { graph, index, substances, minimumCurrent = 11, minimumHistorical = 3 } = {}) {
  const entries = readComparisonProjection(factsDocument)
  const records = readEditionProjection(editionsDocument)
  for (const document of [factsDocument, editionsDocument]) {
    if (document.license !== WHO_LICENSE || !document.attribution?.includes('World Health Organization') ||
      !document.adaptation?.includes('Adapted') || !document.endorsement?.includes('No endorsement by WHO')) fail('WHO attribution, license and adaptation/no-endorsement notices required')
  }
  if (!entries.length || !records.length) fail('empty projections')
  if (entries.some(e => e.publisher !== 'phint' || e.tests.some(t => t.method && t.method.publisher !== 'phint')) || records.some(r => r.publisher !== 'phint')) fail('only reviewed PhInt fields are authorized')
  if (entries.some(e => e.tests.some(t => t.method && !t.method.catalog))) fail('explicit reviewed or unresolved catalog result required')
  if (entries.some(e => e.substanceId === 'zidovudine') && !factsDocument.adaptation?.includes('original raw capture authentication is unavailable')) fail('captured-native source limitation required')
  if (!Array.isArray(graph) || !Array.isArray(index) || !substances) fail('vendored identity inputs required')
  function currentIdentity(endpoint, substanceId) {
    const slug = endpoint.entryId.split('/').pop()
    const matches = graph.filter(e => e['@id'] === endpoint.entryId && e.edition === endpoint.edition)
    if (!matches.length) return false
    const categories = new Set(matches.map(publicEntryCategory))
    if (categories.size !== 1) fail('ambiguous current graph category')
    const selection = resolveEntrySelection(graph, index, { publisher: 'phint', slug, category: [...categories][0] })
    if (!selection || selection.entry['@id'] !== endpoint.entryId || selection.entry.edition !== endpoint.edition || selection.substanceId !== substanceId) fail('current graph/index identity mismatch')
    const substance = substances[substanceId]
    if (!substance || substance.id !== substanceId || !substance.entries?.some(e => e.d === 'phint' && e.s === slug && e.c === selection.category && e.edition === endpoint.edition)) fail('registry identity/edition mismatch')
    return true
  }
  for (const record of records) {
    if (record.status !== 'verified') fail('only verified edition pairs may be exported')
    if (!record.comparedFields?.length || record.changes.some(change => !record.comparedFields.includes(change.field))) fail('explicit compared-field scope required')
    const endpoints = [record.from, record.to]
    if (!endpoints.some(endpoint => currentIdentity(endpoint, record.substanceId))) fail('edition pair lacks verified current identity')
  }
  let current = 0, historical = 0
  for (const entry of entries) {
    if (!entry.tests.length) fail('empty test list')
    if (currentIdentity(entry, entry.substanceId)) { current++; continue }
    const verifiedEndpoint = records.some(record => record.substanceId === entry.substanceId && [record.from, record.to].some(endpoint => endpoint.entryId === entry.entryId && endpoint.edition === entry.edition && endpoint.substanceId === entry.substanceId))
    if (!verifiedEndpoint) fail('historical fact lacks verified edition endpoint')
    historical++
  }
  if (current < minimumCurrent || historical < minimumHistorical) fail('reviewed current/historical coverage floor')
  return { currentEntries: current, historicalEntries: historical, tests: entries.reduce((n,e) => n + e.tests.length, 0), methods: entries.reduce((n,e) => n + e.tests.filter(t => t.method).length, 0), catalogFamilies: entries.reduce((n,e) => n + e.tests.filter(t => t.method?.catalog?.status === 'reported').length, 0), unresolvedCatalogReferences: entries.reduce((n,e) => n + e.tests.filter(t => t.method?.catalog?.status === 'unresolved').length, 0), editionPairs: records.length, changes: records.reduce((n,r) => n + r.changes.length, 0) }
}
export function loadPublicIdentityInputs(directory = root) {
  const read = relative => JSON.parse(fs.readFileSync(path.join(directory, relative), 'utf8'))
  const substances = Object.fromEntries(fs.readdirSync(path.join(directory, 'data/substances')).filter(f => f.endsWith('.json')).map(file => {
    const substance = read(`data/substances/${file}`)
    return [substance.id, substance]
  }))
  return { graph: read('data/phint/phint-monographs.jsonld')['@graph'], index: read('data/search-index.json'), substances }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const read = name => JSON.parse(fs.readFileSync(path.join(root, 'public/data', name), 'utf8'))
    console.log(JSON.stringify({ exit: 0, ...validatePublicProjections(read('comparison-facts.json'), read('edition-diffs.json'), loadPublicIdentityInputs()) }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
