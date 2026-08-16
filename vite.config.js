import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import fs from 'fs'
import path from 'path'

// Find data directory — ./data is canonical (vendored jp/phint + generated
// datasets from scripts/generate-datasets.mjs); the sibling checkout is a fallback.
function getDataDir() {
  const vendoredDir = path.resolve(__dirname, './data')
  const siblingDir = path.resolve(__dirname, '../open-pharmacopoeia/data')
  return fs.existsSync(vendoredDir) ? vendoredDir : siblingDir
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

      // Generate routes for every dataset with a {id}-monographs.jsonld file
      const datasetFiles = fs.existsSync(dataDir)
        ? fs.readdirSync(dataDir).flatMap(id => {
            const f = path.join(dataDir, id, `${id}-monographs.jsonld`)
            return fs.existsSync(f) ? [[id, f]] : []
          })
        : []

      for (const [id, file] of datasetFiles) {
        allRoutes.push(`/pharmacopoeia/${id}`)
        try {
          const graph = JSON.parse(fs.readFileSync(file, 'utf-8'))['@graph'] || []
          let count = 0
          for (const m of graph) {
            // Only monograph-like entries — skip support nodes (op:ChemicalCompound etc.)
            const type = m['@type']
            const types = Array.isArray(type) ? type : (type ? [type] : [])
            const isEntry = types.some(t => typeof t === 'string' && (t.endsWith('Monograph') || t === 'TitleIndexEntry'))
              || (types.length === 0 && !!(m.prefLabel || m['rdfs:label']))
            if (!isEntry) continue
            const entryId = m['@id'] || ''
            const slug = entryId.split('/').pop()
            const category = (typeof m.category === 'string' && m.category) || (entryId.match(/\/data\/[^/]+\/([^/]+)\//) || [])[1] || 'monographs'
            if (!slug) continue
            allRoutes.push(`/pharmacopoeia/${id}/${category}/${slug}`)
            count++
          }
          console.log(`✓ Generated ${count} routes for dataset ${id}`)
        } catch (e) {
          console.warn(`Could not parse ${file}:`, e.message)
        }
      }

      // Index routes for every dataset in the registry, including those without
      // data files yet (raw/extraction status pages)
      const registryFile = path.join(dataDir, 'registry.json')
      if (fs.existsSync(registryFile)) {
        for (const d of JSON.parse(fs.readFileSync(registryFile, 'utf-8'))) {
          if (!allRoutes.includes(`/pharmacopoeia/${d.id}`)) {
            allRoutes.push(`/pharmacopoeia/${d.id}`)
          }
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
