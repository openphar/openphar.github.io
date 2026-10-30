import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { parse as parseTemplate } from '@vue/compiler-dom'
import { parse, compileStyle } from '@vue/compiler-sfc'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data/registry.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/views/HomeView.vue'), 'utf8')
let server, cache, html, nodes, component
const attrs = node => Object.fromEntries(node.props.filter(p => p.type === 6).map(p => [p.name, p.value?.content || '']))
const words = node => node.type === 2 ? node.content : (node.children || []).map(words).join('')
const normalized = value => value.replace(/\s+/g, ' ').trim()

test.before(async () => {
  cache = fs.mkdtempSync(path.join(os.tmpdir(), 'openphar-home-test-'))
  server = await createServer({ root, configFile: false, plugins: [vue()], cacheDir: cache, css: { postcss: { plugins: [] } },
    server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'error' })
  component = (await server.ssrLoadModule('/src/views/HomeView.vue')).default
  html = await renderToString(createSSRApp(component, { initialRegistry: registry }))
  nodes = []
  const walk = node => { if (node.type === 1) nodes.push(node); for (const child of node.children || []) walk(child) }
  walk(parseTemplate(html))
  if (process.env.OPENPHAR_HOME_FIXTURE_DIR) {
    const output = process.env.OPENPHAR_HOME_FIXTURE_DIR
    fs.mkdirSync(output, { recursive: true })
    fs.writeFileSync(path.join(output, 'home.html'), html)
    const descriptor = parse(source).descriptor
    const css = descriptor.styles.map(style => {
      const compiled = compileStyle({ source: style.content, id: component.__scopeId, scoped: style.scoped })
      assert.equal(compiled.errors.length, 0)
      return compiled.code
    }).join('\n')
    fs.writeFileSync(path.join(output, 'home.css'), css)
  }
})

test.after(async () => { await server?.close(); if (cache) fs.rmSync(cache, { recursive: true }) })

test('renders every complete publisher description as a native title and retained accessible description', () => {
  const triggers = nodes.filter(node => attrs(node)['aria-describedby']?.startsWith('dataset-'))
  assert.equal(triggers.length, registry.length)
  for (const trigger of triggers) {
    const a = attrs(trigger)
    const descriptions = nodes.filter(node => attrs(node).id === a['aria-describedby'])
    assert.equal(descriptions.length, 1)
    assert.ok(attrs(descriptions[0]).class.split(/\s+/).includes('sr-only'))
    assert.equal(a.title, normalized(words(descriptions[0])))
    assert.ok(a.title.length > 8)
  }
})

test('does not depend on an authored clipped hover popup or client hydration', () => {
  const descriptions = nodes.filter(node => attrs(node).id?.startsWith('dataset-'))
  assert.ok(descriptions.length > 0)
  assert.ok(descriptions.every(node => !attrs(node).class.includes('group-hover:')))
  const host = fs.readFileSync(path.join(root, 'src/pages/index.astro'), 'utf8')
  assert.match(host, /<HomeView\s+initialRegistry=/)
  assert.doesNotMatch(host, /<HomeView[^>]*client:/)
  assert.doesNotMatch(html, /<script|<astro-island/)
})

test('retains native link targets and dataset identity rather than replacing navigation with a disclosure', () => {
  for (const dataset of registry) {
    const node = nodes.find(node => attrs(node)['aria-describedby'] === `dataset-${dataset.id}-description`)
    assert.ok(node)
    const a = attrs(node)
    assert.ok(a.title.startsWith(dataset.name + ' · '))
    if (node.tag === 'a') assert.ok(a.href.startsWith('/pharmacopoeia/') || a.href === '/ontology')
    else assert.equal(node.tag, 'div')
  }
})
