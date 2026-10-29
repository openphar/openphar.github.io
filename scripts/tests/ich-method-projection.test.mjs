import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parse, compileTemplate } from 'vue/compiler-sfc'
import { projectIchMethods, projectIchChapter } from '../lib/ich-method-projection.mjs'

const root = new URL('../../', import.meta.url)
const options = { datasetId: 'ich', edition: 'Q4B current' }
const chapter = fields => ({ publisher: 'Ph.Eur.', code: '2.2.29', source: 'curated', edition: 'ep-10', confidence: 'high', ...fields })
const row = fields => ({ concept: 'liquid_chromatography', name_en: 'Liquid chromatography',
  harmonisation_status: 'not_harmonised', chapters: [chapter()], ...fields })
const project = fields => projectIchMethods([row(fields)], options)[0]

function actualFunction(source, name) {
  const start = source.indexOf(`function ${name}(`)
  const end = source.indexOf('\n}\n', start)
  assert.ok(start >= 0 && end > start, `Actual ${name} function boundary missing`)
  return source.slice(start, end + 2)
}

function actualBuilder(directory) {
  const source = fs.readFileSync(new URL('scripts/generate-datasets.mjs', root), 'utf8')
  // Execute actual function declarations with real filesystem/YAML dependencies.
  // Never import the generator's top-level public-data writing loop.
  return vm.runInNewContext(actualFunction(source, 'buildIchMethods') + '\n' +
    actualFunction(source, 'slugify') + '\nbuildIchMethods', {
    fs, path, yamlLoad, ROOT: directory, MAX_SECTION_CHARS: 6000, projectIchMethods
  })
}

async function renderActualBadge(monograph, publisher = 'ich', category = monograph.category || '') {
  const source = fs.readFileSync(new URL('src/views/MonographDetailView.vue', root), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.equal(errors.length, 0)
  let badge
  function find(node) {
    if (node.tag === 'div' && node.props?.some(p => p.name === 'if' &&
      p.exp?.content === 'monograph.harmonisationStatus || monograph.ichAnnex')) badge = node
    for (const child of node.children ?? []) find(child)
  }
  find(descriptor.template.ast)
  assert.ok(badge, 'Actual detail-view badge subtree missing')
  const compiled = compileTemplate({ source: badge.loc.source, filename: 'actual-detail-badge.vue', id: 'badge',
    ssr: true, compilerOptions: { mode: 'function' } })
  assert.deepEqual(compiled.errors, [])
  const ssrRender = new Function('require', compiled.code)(createRequire(import.meta.url))
  return renderToString(createSSRApp({ props: ['monograph', 'publisher', 'category'], ssrRender }, { monograph, publisher, category }))
}

test('keeps stable method ID, label, category and literal catalog status/edition', () => {
  const entry = project({ concept: 'Some_METHOD' })
  assert.equal(entry['@id'], 'https://www.openphar.org/data/ich/methods/some-method')
  assert.equal(entry['@type'], 'IndexedMonograph')
  assert.deepEqual(entry.prefLabel, { en: 'Liquid chromatography' })
  assert.equal(entry.category, 'methods')
  assert.equal(entry.edition, options.edition)
  assert.equal(entry.harmonisationStatus, 'not_harmonised')
  assert.deepEqual(entry.catalogProvenance, { kind: 'method-family-association',
    statusMeaning: 'catalog-concept-claim', applicabilityStatus: 'unresolved' })
  assert.doesNotMatch(entry.definition.en, /ICH Q4B harmonised analytical method|Equivalent chapters|official equivalence/)
})

test('curated metadata stays distinct from official-source provenance', () => {
  const curated = projectIchChapter(chapter())
  const official = projectIchChapter(chapter({ source: 'ich_official' }))
  assert.equal(curated.chapterReference.source, 'curated')
  assert.match(curated.text, /Curated method-family reference; not an ICH-official claim/)
  assert.match(official.text, /Official-source catalog reference; provenance is not interchangeability/)
  for (const entry of [curated, official]) {
    assert.equal(entry.chapterReference.applicabilityStatus, 'unresolved')
    assert.doesNotMatch(entry.text, /official equivalence/)
  }
})

test('same chapter code in JP15 and JP16 remains two exact qualified references', () => {
  const entry = project({ chapters: [chapter({ publisher: 'JP', code: '2.02', edition: 'JP15' }),
    chapter({ publisher: 'JP', code: '2.02', edition: 'JP16' })] })
  assert.equal(entry.sections.length, 2)
  assert.deepEqual(entry.sections.map(s => s.chapterReference.edition), ['JP15', 'JP16'])
  assert.notEqual(entry.sections[0].name, entry.sections[1].name)
  for (const edition of ['JP15', 'JP16']) assert.match(entry.sections.find(s => s.chapterReference.edition === edition).text, new RegExp(edition))
  assert.doesNotMatch(JSON.stringify(entry), /JP18|JP-current/)
  assert.equal(projectIchChapter(chapter({ edition: ' EP 10.0 ' })).chapterReference.edition, ' EP 10.0 ')
})

test('missing metadata stays unspecified without inferred edition/status/source', () => {
  const entry = project({ harmonisation_status: undefined, ich_annex: undefined,
    chapters: [{ publisher: 'USP', code: '<281>' }] })
  assert.equal(Object.hasOwn(entry, 'harmonisationStatus'), false)
  assert.equal(Object.hasOwn(entry, 'ichAnnex'), false)
  assert.equal(Object.hasOwn(entry.sections[0].chapterReference, 'edition'), false)
  assert.equal(Object.hasOwn(entry.sections[0].chapterReference, 'source'), false)
  assert.equal(entry.sections[0].chapterReference.referenceStatus, 'unresolved')
  assert.match(entry.sections[0].text, /Edition not supplied/)
  assert.match(entry.definition.en, /Catalog concept status: not supplied/)
})

test('unknown scalar labels remain literal and never become approved source/confidence/status', () => {
  const entry = project({ harmonisation_status: 'new_catalog_label',
    chapters: [chapter({ source: 'other_source', confidence: 'unrated' })] })
  assert.equal(entry.harmonisationStatus, 'new_catalog_label')
  assert.equal(entry.sections[0].chapterReference.source, 'other_source')
  assert.equal(entry.sections[0].chapterReference.confidence, 'unrated')
  assert.equal(entry.sections[0].chapterReference.referenceStatus, 'unresolved')
  assert.match(entry.definition.en, /unrecognised label/)
})

test('explicit rejected/malformed source validation never yields a positive reported reference', () => {
  for (const source_validation of [{ status: 'contradicted' }, { status: 'unverified' },
    { status: 'unknown_status' }, {}, null, false, []]) {
    const entry = projectIchChapter(chapter({ source: 'ich_official', source_validation }))
    assert.equal(entry.chapterReference.referenceStatus, 'unresolved')
    assert.match(entry.text, /no positive association asserted/)
    assert.doesNotMatch(entry.text, /Official-source catalog reference|Curated method-family reference/)
  }
  assert.equal(projectIchChapter(chapter({ source_validation: { status: 'verified' } })).chapterReference.referenceStatus, 'reported')
})

test('does not publish notes, bodies, local paths, source-proof detail or arbitrary extensions', () => {
  const entry = project({ note: 'PRIVATE_METHOD_SENTINEL', raw_sections: ['PRIVATE_BODY_SENTINEL'],
    assistant_session_id: 'PRIVATE_SESSION_SENTINEL', chapters: [chapter({
      note: '/home/private/PRIVATE_NOTE_SENTINEL', rationale: 'PRIVATE_RATIONALE_SENTINEL',
      conditions: { raw: 'PRIVATE_CONDITION_SENTINEL' }, limitations: ['PRIVATE_LIMIT_SENTINEL'],
      body: 'PRIVATE_BODY_SENTINEL', source_pointer: '/private/PRIVATE_POINTER_SENTINEL',
      source_validation: { status: 'verified', reason: 'PRIVATE_REASON_SENTINEL', evidence_ref: '.codex-context/PRIVATE_EVIDENCE_SENTINEL' }
    })] })
  const json = JSON.stringify(entry)
  assert.doesNotMatch(json, /PRIVATE_|\/home\/private|\.codex-context|raw_sections|source_pointer|assistant_session_id|evidence_ref/)
  assert.equal(entry.qualificationsWithheld, true)
  assert.equal(entry.sections[0].chapterReference.qualificationsWithheld, true)
  assert.match(entry.sections[0].text, /qualifying metadata is not exported/)
  assert.doesNotMatch(entry.sections[0].text, /scientific restriction applies/)
})

test('rejects private path/control/body-sized data in selected public metadata fields', () => {
  for (const value of ['/home/user/private.yaml', '/srv/private.yaml', '/opt/private.yaml', '../private.yaml', './private.yaml', '..\\private.yaml', 'file:///private/data', 'C:\\Users\\private',
    '.codex-context/evidence/private.json', 'value\nsource body', 'x'.repeat(513)]) {
    assert.throws(() => project({ name_en: value }), /supported public index metadata/)
  }
  for (const value of [false, 10, {}, []]) {
    assert.throws(() => projectIchChapter(chapter({ edition: value })), TypeError)
    assert.throws(() => projectIchChapter(chapter({ confidence: value })), TypeError)
  }
  assert.throws(() => project({ concept: '../private' }), TypeError)
  assert.throws(() => projectIchMethods([row()], { datasetId: '../ich' }), TypeError)
  assert.throws(() => project({ chapters: {} }), /array/)
})

test('never mutates or aliases original metadata and free-form notes', () => {
  const input = [row({ chapters: [chapter({ note: 'PRIVATE_SENTINEL' })] })]
  const frozen = structuredClone(input)
  Object.freeze(input[0].chapters[0]); Object.freeze(input[0].chapters); Object.freeze(input[0]); Object.freeze(input)
  const result = projectIchMethods(input, options)
  result[0].sections[0].chapterReference.code = 'different'
  assert.deepEqual(input, frozen)
})

test('actual generator function uses qualified helper and leaves fixture guideline/annex behavior intact', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ich-method-projection-'))
  try {
    const fixtureRows = [row({ chapters: [chapter({ edition: 'JP15', publisher: 'JP', code: '2.02' }),
      chapter({ edition: 'JP16', publisher: 'JP', code: '2.02' })] })]
    fs.writeFileSync(path.join(directory, 'methods.yaml'), yamlDump(fixtureRows))
    fs.mkdirSync(path.join(directory, 'docs'))
    fs.writeFileSync(path.join(directory, 'docs/annex.yaml'), yamlDump({ title: 'Synthetic annex',
      canonical_iri: 'https://example.test/synthetic-annex', code: 'fixture-1', document_type: 'q4b_annex',
      status: 'current', method: 'Synthetic method', sections: [{ name: 'Conditions', text: 'Synthetic conditions.' }],
      regional_chapters: [{ pharmacopoeia: 'JP', chapter_code: '2.02', chapter_title: 'Synthetic chapter' }] }))
    const result = actualBuilder(directory)('ich', { edition: 'fixture-catalog',
      generate: { repo: '.', file: 'methods.yaml', docs_globs: ['docs/*.yaml'] } })
    assert.equal(result.graph.length, 2)
    assert.equal(result.skipped, 0); assert.equal(result.total, 1)
    assert.deepEqual(result.graph[0], projectIchMethods(fixtureRows, { datasetId: 'ich', edition: 'fixture-catalog' })[0])
    assert.deepEqual(JSON.parse(JSON.stringify(result.graph[1])), {
      '@id': 'https://www.openphar.org/data/ich/methods/synthetic-annex', '@type': 'IndexedMonograph',
      prefLabel: { en: 'Synthetic annex' }, monographId: 'fixture-1', edition: 'fixture-catalog', category: 'annexes',
      harmonisationStatus: 'current', ichAnnex: 'fixture-1', definition: { en: 'Synthetic method' },
      sections: [{ name: 'Conditions', text: 'Synthetic conditions.' }, { name: 'JP 2.02', text: 'Synthetic chapter' }]
    })
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('actual Vue badge renders catalog meaning for all catalog statuses and preserves guideline label', async () => {
  for (const harmonisation_status of ['harmonised', 'not_harmonised', 'partial', 'unknown_status']) {
    const html = await renderActualBadge(project({ harmonisation_status }))
    assert.match(html, /Catalog status/)
    assert.match(html, new RegExp(harmonisation_status))
    assert.doesNotMatch(html, /ICH Q4B/)
  }
  assert.match(await renderActualBadge({ harmonisationStatus: 'current', ichAnnex: 'fixture-annex' }), /ICH Q4B.*current/)
})

test('actual legacy method badge labels native status as catalog metadata', async () => {
  const html = await renderActualBadge({ category: 'methods', harmonisationStatus: 'not_harmonised' })
  assert.match(html, /Catalog status/)
  assert.match(html, /not_harmonised/)
  assert.doesNotMatch(html, /ICH Q4B/)
})
