import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parse, compileTemplate } from 'vue/compiler-sfc'

const root = fileURLToPath(new URL('../../', import.meta.url))

async function renderedResources() {
  const source = fs.readFileSync(new URL('../../src/views/OntologyBrowserView.vue', import.meta.url), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.deepEqual(errors, [])
  const sections = []
  function visit(node) {
    if (node.tag === 'div' && node.children?.some(child => child.tag === 'h2' &&
      child.children?.some(text => typeof text.content === 'string' && text.content.trim() === 'Resources'))) sections.push(node.loc.source)
    for (const child of node.children ?? []) visit(child)
  }
  visit(descriptor.template.ast)
  assert.equal(sections.length, 1, 'Render the actual ontology Resources section')
  const compiled = compileTemplate({ source: sections[0], filename: 'actual-ontology-resources.vue',
    id: 'ontology-resources', ssr: true, compilerOptions: { mode: 'function' } })
  assert.deepEqual(compiled.errors, [])
  const ssrRender = new Function('require', compiled.code)(createRequire(import.meta.url))
  return renderToString(createSSRApp({ ssrRender }))
}

test('keeps the working JP JSON-LD download and resolves every advertised resource', async () => {
  const html = await renderedResources()
  const links = Array.from(html.matchAll(/href="([^"]+)"/g), match => match[1])
  assert.ok(links.includes('/data/jp/jp-monographs.jsonld'))
  assert.match(html, />\s*JP Monographs \(JSON-LD\)\s*</)
  for (const href of links) {
    assert.ok(href.startsWith('/'), `Resource must have an explicit local destination: ${href}`)
    const destination = path.join(root, href.slice(1))
    assert.ok(fs.existsSync(destination) && fs.statSync(destination).isFile(), `Missing resource: ${href}`)
    assert.ok(fs.statSync(destination).size > 0, `Empty resource: ${href}`)
  }
})

test('shows unavailable Turtle as readable text without advertising a missing download', async () => {
  const html = await renderedResources()
  assert.match(html, /JP Monographs \(Turtle unavailable\)/)
  assert.doesNotMatch(html, /href="\/data\/jp\/jp-monographs\.ttl"/)
  assert.doesNotMatch(html, /<a\b[^>]*>\s*JP Monographs \(Turtle/)
})
