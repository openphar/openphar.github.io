#!/usr/bin/env node
// Runs axe-core over the Compare page states listed in docs/COMPARE_ACCEPTANCE.md
// and the major hub views listed in docs/WCAG_AA.md. Serves the built site from
// dist/ on 127.0.0.1 and drives a local Chrome through the DevTools protocol.
// Each state also gets a keyboard pass (Tab through the page; every focus stop
// must show a focus indicator) and, at 320px, a page-level reflow check.
// Prints the results per state and exits 1 on any serious or critical axe
// violation, a focus stop without an indicator, or horizontal page scrolling at
// 320px. Build first with `npm run build`.
// Usage: node scripts/check-compare-a11y.mjs [--only compare|hub] [--json FILE] [--dist DIR]
// --dist checks another build directory, e.g. .astro-sample from OPENPHAR_BUILD_SAMPLE=1.
// CHROME_PATH selects the browser binary (default: google-chrome).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let dist = path.join(root, 'dist')
const axeSource = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

// WCAG 1.4.12 text-spacing overrides used by the narrow-spacing state.
const SPACING_CSS = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'

const COMPARE_STATES = [
  ['acetaminophen-current', '/compare?entry=us/acetaminophen', 1280],
  ['acetaminophen-keyboard-editions', '/compare?entry=us/acetaminophen&uspEdition=2015-USP38-NF33&edition=PhInt-12', 1280],
  ['albendazole-historical', '/compare?entry=phint/6-1-7&edition=PhInt-11', 1280],
  ['acetaminophen-narrow', '/compare?entry=us/acetaminophen&edition=PhInt-12', 375],
  ['acetaminophen-narrow-spacing', '/compare?entry=us/acetaminophen&edition=PhInt-12', 375, SPACING_CSS],
  ['acetaminophen-reflow-320', '/compare?entry=us/acetaminophen&edition=PhInt-12', 320],
  ['zidovudine-current', '/compare?entry=phint/6-1-375', 1280],
  ['zidovudine-keyboard-differences', '/compare?entry=phint/6-1-375&edition=PhInt-12', 1280],
  ['zidovudine-reflow-320', '/compare?entry=phint/6-1-375&edition=PhInt-12', 320],
]

// Major hub views: one state per page template, plus title-only, native-language,
// edition and narrow-width variants. docs/WCAG_AA.md maps them to WCAG criteria.
const HUB_STATES = [
  ['home', '/', 1280],
  ['home-reflow-320', '/', 320],
  ['publisher-full', '/pharmacopoeia/phint/', 1280],
  ['publisher-title-only', '/pharmacopoeia/us/', 1280],
  ['publisher-native', '/pharmacopoeia/kp/', 1280],
  ['monograph-full', '/pharmacopoeia/jp/chemicals/acetaminophen/', 1280],
  ['monograph-edition-changes', '/pharmacopoeia/phint/monographs/6-1-375/?edition=PhInt-12', 1280],
  ['monograph-title-only', '/pharmacopoeia/us/monographs/acetaminophen/', 1280],
  ['monograph-native', '/pharmacopoeia/kp/part1/acyclovir/', 1280],
  ['monograph-reflow-320', '/pharmacopoeia/phint/monographs/6-1-375/?edition=PhInt-12', 320],
  ['search-results', '/search/?q=acetaminophen', 1280],
  ['search-native', '/search/?q=%E3%82%A2%E3%82%BB%E3%83%88%E3%82%A2%E3%83%9F%E3%83%8E%E3%83%95%E3%82%A7%E3%83%B3', 1280],
  ['search-reflow-320', '/search/?q=acetaminophen', 320],
  ['substance', '/substance/paracetamol/', 1280],
  ['substance-reflow-320', '/substance/paracetamol/', 320],
  ['ontology', '/ontology/', 1280],
  ['api', '/api/', 1280],
  ['api-reflow-320', '/api/', 320],
]

const MAX_TABS = 60

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jsonld': 'application/ld+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ttl': 'text/turtle' }

function serve() {
  const server = http.createServer((req, res) => {
    let pathname
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { res.writeHead(400).end(); return }
    let file = path.resolve(dist, '.' + pathname)
    if (file !== dist && !file.startsWith(dist + path.sep)) { res.writeHead(403).end(); return }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    else if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html'
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'openphar-a11y-'))
  const chrome = spawn(process.env.CHROME_PATH || 'google-chrome', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ''
    chrome.on('error', reject)
    chrome.on('exit', code => reject(new Error(`Chrome exited (${code}). Set CHROME_PATH to a Chrome or Chromium binary.`)))
    chrome.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) resolve(m[1]) })
  })
  return { chrome, profile, wsUrl }
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    } else listeners.forEach(fn => fn(msg))
  }
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })
  const once = (method, sessionId) => new Promise(resolve => {
    const fn = msg => { if (msg.method === method && msg.sessionId === sessionId) { listeners.splice(listeners.indexOf(fn), 1); resolve(msg) } }
    listeners.push(fn)
  })
  return new Promise((resolve, reject) => { ws.onopen = () => resolve({ ws, send, once }); ws.onerror = reject })
}

async function checkState(client, base, [name, route, width, css]) {
  const { send, once } = client
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  try {
    await send('Page.enable', {}, sessionId)
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }, sessionId)
    const loaded = once('Page.loadEventFired', sessionId)
    await send('Page.navigate', { url: base + route }, sessionId)
    await loaded
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    }
    // Let client-side rendering settle: wait until the DOM stops changing.
    await evaluate(`new Promise(res => { let t; const done = () => { o.disconnect(); res() };
      const o = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 750) });
      o.observe(document, { subtree: true, childList: true, attributes: true }); t = setTimeout(done, 750);
      setTimeout(done, 15000) })`)
    if (css) await evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.append(s) })()`)
    await evaluate(axeSource)
    const violations = await evaluate(`axe.run(document).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })))`)
    const reflow = width <= 320 ? await evaluate(`(() => { const e = document.scrollingElement; return { scrollWidth: e.scrollWidth, clientWidth: e.clientWidth } })()`) : null
    // Keyboard pass: Tab from the top of the page and inspect each focus stop.
    await evaluate(`(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })()`)
    const stops = []
    for (let i = 0; i < MAX_TABS; i++) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId)
      const stop = await evaluate(`(() => { const el = document.activeElement
        if (!el || el === document.body) return null
        const cs = getComputedStyle(el), r = el.getBoundingClientRect()
        const indicator = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
        return { tag: el.tagName.toLowerCase(), name, indicator, inViewport: r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0,
          key: el.tagName + '|' + (el.id || '') + '|' + Math.round(r.left + scrollX) + ',' + Math.round(r.top + scrollY) } })()`)
      if (!stop || (stops.length && stop.key === stops[0].key)) break
      stops.push(stop)
    }
    return { violations, reflow, stops }
  } finally {
    await send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

function parseArgs(argv) {
  const opts = { only: null, json: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only' && ['compare', 'hub'].includes(argv[i + 1])) opts.only = argv[++i]
    else if (argv[i] === '--json' && argv[i + 1]) opts.json = argv[++i]
    else if (argv[i] === '--dist' && argv[i + 1]) dist = path.resolve(argv[++i])
    else { console.error('Usage: check-compare-a11y.mjs [--only compare|hub] [--json FILE] [--dist DIR]'); process.exit(2) }
  }
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const states = [...(opts.only === 'hub' ? [] : COMPARE_STATES.map(s => ['compare', ...s])), ...(opts.only === 'compare' ? [] : HUB_STATES.map(s => ['hub', ...s]))]
  if (!fs.existsSync(path.join(dist, 'compare', 'index.html')) && !fs.existsSync(path.join(dist, 'compare.html'))) {
    console.error(`${dist} has no Compare page. Run \`npm run build\` first.`)
    process.exit(2)
  }
  const server = await serve()
  const base = `http://127.0.0.1:${server.address().port}`
  const { chrome, profile, wsUrl } = await launchChrome()
  let blocking = 0
  const results = []
  try {
    const client = await cdp(wsUrl)
    for (const [group, ...state] of states) {
      const { violations, reflow, stops } = await checkState(client, base, state)
      const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      const noIndicator = stops.filter(s => !s.indicator)
      const overflow = reflow && reflow.scrollWidth > reflow.clientWidth + 1
      blocking += serious.length + noIndicator.length + (overflow ? 1 : 0)
      results.push({ group, name: state[0], route: state[1], width: state[2], violations, focusStops: stops.length, focusStopsWithoutIndicator: noIndicator, reflow })
      console.log(`${state[0]} (${state[2]}px): ${violations.length ? violations.length + ' violation(s)' : 'no violations'}; ${stops.length} focus stop(s), ${noIndicator.length} without indicator${reflow ? `; page width ${reflow.scrollWidth}/${reflow.clientWidth}px` : ''}`)
      for (const v of violations) console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes} node(s))`)
      for (const s of noIndicator) console.log(`  [focus] no visible indicator on <${s.tag}> "${s.name}"`)
      if (overflow) console.log('  [reflow] page scrolls horizontally at 320px')
    }
    client.ws.close()
  } finally {
    if (chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve))
      chrome.kill()
      await exited
    }
    server.close()
    // Chrome can still be writing to its profile right after exit; a leftover temp dir is harmless.
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch {}
  }
  if (opts.json) fs.writeFileSync(opts.json, JSON.stringify({ axeVersion: JSON.parse(fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/package.json'))).version, states: results }, null, 2) + '\n')
  console.log(blocking ? `FAIL: ${blocking} blocking finding(s)` : `OK: ${results.length} state(s), no serious or critical violations, every focus stop shows an indicator, no horizontal scrolling at 320px`)
  process.exit(blocking ? 1 : 0)
}

main().catch(err => { console.error(err); process.exit(2) })
