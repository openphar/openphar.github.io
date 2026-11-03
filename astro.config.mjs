import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const sample = process.env.OPENPHAR_BUILD_SAMPLE === '1'
if (sample && process.env.CI) throw new Error('Sample builds are local diagnostics only')

// Keep vendored assets canonical in dev and production. No sibling checkout,
// source regeneration or private corpus is required to build the public site.
function vendoredAssets() {
  return {
    name: 'openphar-vendored-assets',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => updateConfig({ vite: { plugins: [{
        name: 'openphar-vendored-dev',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            let pathname
            try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch { return next() }
            const folder = ['data', 'ontology'].find(name => pathname.startsWith(`/${name}/`))
            if (!folder) return next()
            const base = path.join(root, folder)
            const file = path.resolve(root, '.' + pathname)
            if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
            res.setHeader('Content-Type', ({ '.json': 'application/json', '.jsonld': 'application/ld+json', '.ttl': 'text/turtle' })[path.extname(file)] || 'application/octet-stream')
            fs.createReadStream(file).pipe(res)
          })
        }
      }] } }),
      'astro:build:done': ({ dir }) => {
        for (const folder of ['data', 'ontology']) {
          const source = path.join(root, folder)
          if (!fs.existsSync(source)) throw new Error(`Missing vendored ${folder}`)
          fs.cpSync(source, path.join(fileURLToPath(dir), folder), { recursive: true })
        }
      }
    }
  }
}

export default defineConfig({
  site: 'https://www.openphar.org',
  base: '/',
  output: 'static',
  trailingSlash: 'always',
  outDir: sample ? './.astro-sample' : './dist',
  integrations: [vue(), vendoredAssets()],
  vite: {
    plugins: [tailwindcss()],
    // Preserve the inactive legacy file without auto-loading its old plugins.
    css: { postcss: { plugins: [] } }
  }
})
