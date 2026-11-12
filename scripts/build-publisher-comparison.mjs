// Builds public/data/publisher-comparison.json from the reviewed selection.
// Canonical sources are read from pinned commits of the private data repos and
// must match the selection's expected values exactly; JP limits come from the
// vendored public JP dataset. Only selected numeric limits leave the sources.
//
//   node scripts/build-publisher-comparison.mjs --workspace <dir holding data-* clones> [--selection FILE]
//
// Entries for publishers under the publication hold (comparison-contract.js)
// are still checked against their sources, then left out of the output.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { load as yamlLoad } from 'js-yaml'
import { validateTest, readComparisonProjection } from '../src/lib/comparison-contract.js'
import { PUBLISHER_COMPARISON_SCHEMA, normalizeUnit, buildMethodMappings, readPublisherComparison, publishable } from '../src/lib/publisher-comparison.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const NOTICE = 'Selected limits are transcribed from full-rights publisher records into typed values. Unit spellings (percent, per cent, %) are unified; no unit or basis is converted. Method mappings are lookups in the public ICH method catalog: they do not establish applicability, scientific equivalence or regulatory interchangeability.'
const JP_OPERATORS = { 'LimitType-NotMoreThan': '<=', 'LimitType-NotLessThan': '>=' }
const fail = message => { throw new Error(`Publisher comparison build: ${message}`) }

// Source-shaped limit -> { operator, value | lower/upper, unit, texts[] }
export function canonicalLimit(test) {
  if (!test || test.limit_status !== 'structured') fail('canonical test is not a structured limit')
  const texts = [test.name, test.limit_subject, test.limit_qualifier, test.raw_text, test.method_ref?.code].filter(v => typeof v === 'string')
  return test.limit_operator === 'range'
    ? { operator: 'range', lower: test.lower_limit, upper: test.upper_limit, unit: test.limit_unit, texts }
    : { operator: test.limit_operator, value: test.limit_value, unit: test.limit_unit, texts }
}

export function jpLimit(spec) {
  const limit = spec?.limit
  if (!limit || !JP_OPERATORS[limit.limitType] || typeof limit.limitValue !== 'number') fail('JP specification lacks a typed limit')
  const texts = [spec.testName?.en, spec.impurityType?.en, spec.assayExpression, spec.dryingConditions?.en, spec.harmonizedMethod].filter(v => typeof v === 'string')
  return { operator: JP_OPERATORS[limit.limitType], value: String(limit.limitValue), unit: limit.limitUnit, texts, harmonizedMethod: spec.harmonizedMethod }
}

export function selectTest(source, selected, publisher, edition, label) {
  const expect = selected.expect
  for (const field of ['operator', 'value', 'lower', 'upper', 'unit']) {
    if (expect[field] !== source[field]) fail(`${label} test ${selected.index}: source ${field} differs from the reviewed selection`)
  }
  const contains = needle => source.texts.some(t => t.includes(needle))
  if (!contains(selected.subject)) fail(`${label} test ${selected.index}: subject not found in source`)
  if (selected.basisText && !contains(selected.basisText)) fail(`${label} test ${selected.index}: basis wording not found in source`)
  const limit = expect.operator === 'range' ? { operator: 'range', lower: expect.lower, upper: expect.upper } : { operator: expect.operator, value: expect.value }
  const test = { key: selected.key, label: selected.label, semanticKey: selected.semanticKey, basis: selected.basis, unit: normalizeUnit(expect.unit), evidence: `${label}, ${selected.subject}: structured limit ${selected.index}`, limit }
  if (selected.method) {
    const m = selected.method
    if (m.harmonizedMethod ? source.harmonizedMethod !== m.harmonizedMethod : !contains(m.chapter)) fail(`${label} test ${selected.index}: method citation not found in source`)
    test.method = { publisher, chapter: m.chapter, label: m.label, evidence: m.harmonizedMethod ? `${label} names the ${m.label} (${m.harmonizedMethod}); chapter number is the ${edition} general-test number` : `${label} cites ${m.chapter}` }
  }
  return validateTest(test, edition)
}

function readCanonical(source, workspace) {
  const repo = path.join(workspace, source.repo)
  const blob = execFileSync('git', ['-C', repo, 'rev-parse', `${source.commit}:${source.path}`], { encoding: 'utf8' }).trim()
  if (blob !== source.blob) fail(`${source.repo} blob differs from the reviewed selection`)
  const doc = yamlLoad(execFileSync('git', ['-C', repo, 'cat-file', 'blob', blob], { encoding: 'utf8', maxBuffer: 64 << 20 }))
  if (doc.id !== source.id) fail(`${source.repo} record id differs`)
  return doc
}

export function buildEntries(selection, { workspace, jpGraph }) {
  return selection.entries.map(entry => {
    let tests
    if (entry.source.kind === 'canonical') {
      const doc = readCanonical(entry.source, workspace)
      if (doc.edition !== entry.edition || doc.substance !== entry.substanceId) fail(`${entry.label}: edition or substance differs`)
      tests = entry.tests.map(t => selectTest(canonicalLimit(doc.tests[t.index]), t, entry.publisher, entry.edition, entry.label))
    } else if (entry.source.kind === 'public-jsonld' && entry.publisher === 'jp') {
      const record = jpGraph.find(e => e['@id'] === entry.entryId)
      if (!record || `JP${record.version}` !== entry.edition) fail(`${entry.label}: public record or edition missing`)
      tests = entry.tests.map(t => selectTest(jpLimit(record.testSpecification?.[t.index]), t, entry.publisher, entry.edition, entry.label))
    } else fail(`unknown source kind ${entry.source.kind}`)
    const out = { publisher: entry.publisher, entryId: entry.entryId, substanceId: entry.substanceId, edition: entry.edition, role: entry.role }
    if (entry.currentEntryId) out.currentEntryId = entry.currentEntryId
    return { ...out, publication: null, tests }
  })
}

export function publicationFor(registry, publisher) {
  const dataset = registry.find(d => d.id === publisher)
  if (!dataset || dataset.rights !== 'full' || !dataset.sourceUrl) fail(`${publisher} is not a full-rights registry dataset`)
  return { status: 'permitted', authority: `Registry rights: full. Publisher source: ${dataset.sourceUrl}` }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), options = {}
    for (let i = 0; i < args.length; i += 2) {
      if (!['--workspace', '--selection'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: --workspace <dir holding the data-* clones> [--selection FILE]')
      options[args[i]] = args[i + 1]
    }
    const read = rel => JSON.parse(fs.readFileSync(path.resolve(root, rel), 'utf8'))
    const selection = read(options['--selection'] || 'scripts/publisher-comparison-selection.json')
    const registry = read('data/registry.json')
    const built = buildEntries(selection, { workspace: path.resolve(options['--workspace'] || '..'), jpGraph: read('data/jp/jp-monographs.jsonld')['@graph'] })
    const entries = built.filter(entry => publishable(entry.publisher))
    for (const entry of entries) entry.publication = publicationFor(registry, entry.publisher)
    const whoEntries = readComparisonProjection(read('public/data/comparison-facts.json'))
    const document = { schema: PUBLISHER_COMPARISON_SCHEMA, notice: NOTICE, entries, methodMappings: buildMethodMappings([...whoEntries, ...entries], read('data/ich/ich-monographs.jsonld')['@graph']) }
    readPublisherComparison(document, whoEntries.flatMap(e => e.tests))
    fs.writeFileSync(path.join(root, 'public/data/publisher-comparison.json'), JSON.stringify(document, null, 2) + '\n')
    console.log(JSON.stringify({ exit: 0, verifiedEntries: built.length, heldEntries: built.length - entries.length, entries: entries.length, tests: entries.reduce((n, e) => n + e.tests.length, 0), methodMappings: document.methodMappings.length }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
