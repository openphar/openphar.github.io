import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parse, compileTemplate } from 'vue/compiler-sfc'
import { methodCatalogDisplay } from '../../src/lib/method-catalog-display.js'
import { extractString } from '../../src/lib/i18n.js'

const legacy = () => ({ category: 'methods', harmonisationStatus: 'not_harmonised',
  definition: { en: 'SYNTHETIC UNQUALIFIED DESCRIPTION' },
  sections: [{ name: 'Synthetic chapter', text: 'SYNTHETIC CHAPTER ASSERTION' }] })

async function actualSections(entry, publisher = 'ich', category = 'methods') {
  const source = fs.readFileSync(new URL('../../src/views/MonographDetailView.vue', import.meta.url), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.equal(errors.length, 0)
  const targets = []
  function visit(node) {
    if (['section', 'details'].includes(node.tag) && node.props?.some(p => p.name === 'if' &&
      ['catalogDisplay.definition', 'sections.length', '!catalogDisplay.legacy'].includes(p.exp?.content))) targets.push(node.loc.source)
    for (const child of node.children ?? []) visit(child)
  }
  visit(descriptor.template.ast)
  assert.equal(targets.length, 3, 'Actual definition, chapter sections and raw-data panel must be tested')
  const compiled = compileTemplate({ source: `<div>${targets.join('')}</div>`, filename: 'actual-catalog-sections.vue',
    id: 'catalog-sections', ssr: true, compilerOptions: { mode: 'function' } })
  assert.deepEqual(compiled.errors, [])
  const ssrRender = new Function('require', compiled.code)(createRequire(import.meta.url))
  const catalogDisplay = methodCatalogDisplay(publisher, category, entry)
  return renderToString(createSSRApp({ ssrRender,
    setup: () => ({ catalogDisplay, sections: catalogDisplay.sections, publisher, category, extractString, monograph: entry }) }))
}

test('withholds legacy generated claims without changing the native status or source object', () => {
  const entry = legacy()
  const before = structuredClone(entry)
  const display = methodCatalogDisplay('ich', 'methods', entry)
  assert.equal(display.legacy, true)
  assert.match(display.definition.en, /Edition and source qualifications are unavailable/)
  assert.deepEqual(display.sections, [])
  assert.deepEqual(entry, before)
  assert.equal(entry.harmonisationStatus, 'not_harmonised')
})

test('keeps qualified-format details and does not treat the marker as a status upgrade', () => {
  const entry = { ...legacy(), catalogProvenance: { kind: 'method-family-association' } }
  const display = methodCatalogDisplay('ich', 'methods', entry)
  assert.equal(display.legacy, false)
  assert.equal(display.definition, entry.definition)
  assert.equal(display.sections, entry.sections)
  assert.equal(entry.harmonisationStatus, 'not_harmonised')
})

test('does not suppress other publishers, guidelines or annexes', () => {
  for (const [publisher, category] of [['phint', 'methods'], ['ich', 'guidelines'], ['ich', 'annexes']]) {
    const entry = legacy()
    const display = methodCatalogDisplay(publisher, category, entry)
    assert.equal(display.legacy, false)
    assert.equal(display.definition, entry.definition)
    assert.equal(display.sections, entry.sections)
  }
})

test('keeps missing or unrecognized format metadata unqualified for ICH methods', () => {
  for (const catalogProvenance of [undefined, null, {}, { kind: 'unknown' }]) {
    assert.equal(methodCatalogDisplay('ich', 'methods', { ...legacy(), catalogProvenance }).legacy, true)
  }
  assert.deepEqual(methodCatalogDisplay('phint', 'substances', undefined).sections, [])
})

test('normalizes a single existing section without changing it', () => {
  const section = { name: 'Synthetic', text: 'Preserve this text.' }
  const display = methodCatalogDisplay('phint', 'substances', { sections: section })
  assert.deepEqual(display.sections, [section])
  assert.equal(display.sections[0], section)
})

test('actual Vue templates withhold legacy claims and show the source qualification explanation', async () => {
  const html = await actualSections(legacy())
  assert.match(html, /Catalog entry/)
  assert.match(html, /Edition and source qualifications are unavailable/)
  assert.doesNotMatch(html, /SYNTHETIC UNQUALIFIED DESCRIPTION|SYNTHETIC CHAPTER ASSERTION|View raw JSON-LD/)
})

test('actual Vue templates retain qualified and noncatalog content', async () => {
  const qualified = { ...legacy(), catalogProvenance: { kind: 'method-family-association' } }
  assert.match(await actualSections(qualified), /Chapter associations/)
  assert.match(await actualSections(qualified), /SYNTHETIC CHAPTER ASSERTION/)
  assert.match(await actualSections(legacy(), 'phint', 'substances'), /SYNTHETIC UNQUALIFIED DESCRIPTION/)
})

test('the actual vendored graph is read without mutation and every legacy method gets the guard', () => {
  const file = new URL('../../data/ich/ich-monographs.jsonld', import.meta.url)
  const before = fs.readFileSync(file)
  const parsed = JSON.parse(before)
  const graph = Array.isArray(parsed) ? parsed : parsed['@graph']
  const methods = graph.filter(entry => entry.category === 'methods')
  assert.ok(methods.length > 0)
  for (const entry of methods) {
    const display = methodCatalogDisplay('ich', 'methods', entry)
    const expectedLegacy = entry.catalogProvenance?.kind !== 'method-family-association'
    assert.equal(display.legacy, expectedLegacy)
    if (expectedLegacy) assert.deepEqual(display.sections, [])
  }
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
  assert.equal(digest(fs.readFileSync(file)), digest(before))
})
