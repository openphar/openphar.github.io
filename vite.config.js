import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import fs from 'fs'
import path from 'path'

// Find data directory - try both locations
function getDataDir() {
  const localDataDir = path.resolve(__dirname, '../open-pharmacopoeia/data')
  const ciDataDir = path.resolve(__dirname, './data')
  return fs.existsSync(localDataDir) ? localDataDir : ciDataDir
}

// Find ontology directory - sibling repo takes precedence, vendored copy is the CI fallback
function getOntologyDir() {
  const siblingDir = path.resolve(__dirname, '../open-pharmacopoeia/ontology')
  const vendoredDir = path.resolve(__dirname, './ontology')
  return fs.existsSync(siblingDir) ? siblingDir : vendoredDir
}

// Plugin to serve data files in dev mode and copy them in build mode
function dataPlugin() {
  const dataDir = getDataDir()

  return {
    name: 'serve-data',

    // In dev mode, serve data files directly
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/data/')) {
          const filePath = path.join(dataDir, req.url.replace('/data/', ''))

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase()
            const contentTypes = {
              '.json': 'application/json',
              '.jsonld': 'application/ld+json',
              '.ttl': 'text/turtle'
            }
            res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
            return fs.createReadStream(filePath).pipe(res)
          }
        }
        if (req.url && req.url.startsWith('/ontology/')) {
          const filePath = path.join(getOntologyDir(), req.url.replace('/ontology/', ''))

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase()
            const contentTypes = {
              '.json': 'application/json',
              '.jsonld': 'application/ld+json',
              '.ttl': 'text/turtle'
            }
            res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream')
            return fs.createReadStream(filePath).pipe(res)
          }
        }
        next()
      })
    },

    // In build mode, copy data files to dist
    closeBundle() {
      if (process.env.NODE_ENV === 'production' || process.env.VITE_SSG) {
        const dataDest = path.join(__dirname, 'dist/data')
        const ontologyDest = path.join(__dirname, 'dist/ontology')

        function copyDir(src, dest) {
          if (!fs.existsSync(src)) return
          fs.mkdirSync(dest, { recursive: true })
          const entries = fs.readdirSync(src, { withFileTypes: true })

          for (const entry of entries) {
            const srcPath = path.join(src, entry.name)
            const destPath = path.join(dest, entry.name)

            if (entry.isDirectory()) {
              copyDir(srcPath, destPath)
            } else {
              fs.copyFileSync(srcPath, destPath)
            }
          }
        }

        copyDir(dataDir, dataDest)
        console.log('✓ Copied data files to dist/data')

        const ontologySrc = getOntologyDir()
        copyDir(ontologySrc, ontologyDest)
        console.log('✓ Copied ontology files to dist/ontology')
      }
    }
  }
}

export default defineConfig({
  plugins: [
    vue(),
    dataPlugin()
  ],
  base: '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@openphar/data': getDataDir()
    }
  },
  ssgOptions: {
    script: 'async',
    formatting: 'minify',
    dirStyle: 'nested',
    includedRoutes(paths, routes) {
      const staticRoutes = paths.filter(p => !p.includes(':'))
      const allRoutes = [...staticRoutes]

      const dataDir = getDataDir()

      // Add routes for each pharmacopoeia
      allRoutes.push('/pharmacopoeia/jp')
      allRoutes.push('/pharmacopoeia/phint')

      // Read JP monographs and generate routes
      const jpMonographsFile = path.join(dataDir, 'jp/jp-monographs.jsonld')
      if (fs.existsSync(jpMonographsFile)) {
        try {
          const content = fs.readFileSync(jpMonographsFile, 'utf-8')
          const data = JSON.parse(content)
          const allItems = data['@graph'] || []

          // Filter to only actual monographs (types ending in "Monograph")
          const monographs = allItems.filter(m => {
            const type = m['@type']
            if (Array.isArray(type)) {
              return type.some(t => typeof t === 'string' && t.endsWith('Monograph'))
            }
            return typeof type === 'string' && type.endsWith('Monograph')
          })

          for (const m of monographs) {
            const id = m['@id'] || ''
            // Match @id format: https://www.openphar.org/data/jp/{category}/{slug}
            const match = id.match(/\/data\/jp\/([^/]+)\/([^/]+)$/)
            if (match) {
              const [, category, slug] = match
              allRoutes.push(`/pharmacopoeia/jp/${category}/${slug}`)
            }
          }
          console.log(`✓ Generated ${monographs.length} JP monograph routes`)
        } catch (e) {
          console.warn('Could not parse JP monographs:', e.message)
        }
      }

      return allRoutes
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  }
})
