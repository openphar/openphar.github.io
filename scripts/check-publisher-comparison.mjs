// Publication gate for public/data/publisher-comparison.json (runs in build and CI).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveEntrySelection, publicEntryCategory, bindPublicIdentitySearchIndex, readComparisonProjection } from '../src/lib/comparison-contract.js'
import { readPublisherComparison, buildMethodMappings } from '../src/lib/publisher-comparison.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fail = reason => { throw new Error(`Publisher comparison gate: ${reason}`) }

export function validatePublisherComparison(document, { registry, graphs, index, substances, ichGraph, whoFacts }) {
  const whoEntries = readComparisonProjection(whoFacts)
  const { entries } = readPublisherComparison(document, whoEntries.flatMap(e => e.tests))
  for (const entry of entries) {
    const dataset = registry.find(d => d.id === entry.publisher)
    if (!dataset || dataset.rights !== 'full') fail(`${entry.publisher} is not a full-rights dataset`)
    if (entry.role !== 'current') continue
    const graph = graphs[entry.publisher]
    if (!Array.isArray(graph)) fail(`${entry.publisher} public graph missing`)
    const matches = graph.filter(e => e['@id'] === entry.entryId)
    if (matches.length !== 1) fail(`${entry.entryId} is not one public graph entry`)
    const selection = resolveEntrySelection(graph, index, { publisher: entry.publisher, slug: entry.entryId.split('/').pop(), category: publicEntryCategory(matches[0]), datasetEdition: dataset.edition || '' })
    if (!selection || selection.edition !== entry.edition || selection.substanceId !== entry.substanceId) fail(`${entry.entryId} graph/index identity or edition mismatch`)
    const substance = substances[entry.substanceId]
    if (!substance?.entries?.some(e => e.d === entry.publisher && e.s === entry.entryId.split('/').pop() && e.edition === entry.edition)) fail(`${entry.entryId} registry identity/edition mismatch`)
  }
  if (JSON.stringify(buildMethodMappings([...whoEntries, ...entries], ichGraph)) !== JSON.stringify(document.methodMappings)) fail('method mappings differ from the public ICH method catalog')
  const publishersBySubstance = {}
  for (const entry of entries) (publishersBySubstance[entry.substanceId] ||= new Set()).add(entry.publisher)
  return {
    entries: entries.length,
    historicalEntries: entries.filter(e => e.role === 'historical').length,
    tests: entries.reduce((n, e) => n + e.tests.length, 0),
    citations: entries.reduce((n, e) => n + e.tests.filter(t => t.method).length, 0),
    methodMappings: document.methodMappings.length,
    mappedChapters: document.methodMappings.filter(m => m.concepts.length).length,
    publishersBySubstance: Object.fromEntries(Object.entries(publishersBySubstance).map(([k, v]) => [k, [...v].sort()]))
  }
}

export function loadInputs(directory = root, publishers = ['jp', 'chp', 'ip', 'kp', 'tp', 'phint']) {
  const read = relative => JSON.parse(fs.readFileSync(path.join(directory, relative), 'utf8'))
  const substances = Object.fromEntries(fs.readdirSync(path.join(directory, 'data/substances')).filter(f => f.endsWith('.json')).map(file => {
    const substance = read(`data/substances/${file}`)
    return [substance.id, substance]
  }))
  const graphs = Object.fromEntries(publishers.map(p => [p, read(`data/${p}/${p}-monographs.jsonld`)['@graph']]))
  return { registry: read('data/registry.json'), graphs, index: bindPublicIdentitySearchIndex(read('data/search-index.json'), Object.values(substances)), substances, ichGraph: read('data/ich/ich-monographs.jsonld')['@graph'], whoFacts: read('public/data/comparison-facts.json') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const document = JSON.parse(fs.readFileSync(path.join(root, 'public/data/publisher-comparison.json'), 'utf8'))
    console.log(JSON.stringify({ exit: 0, ...validatePublisherComparison(document, loadInputs()) }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
