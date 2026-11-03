// Explicit reviewed input files only: no source discovery, corpus parser or network.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readComparisonProjection, fromCanonicalLimit } from '../src/lib/comparison-contract.js'
import { readEditionProjection } from '../src/lib/edition-diff.js'
import { validatePublicProjections, loadPublicIdentityInputs, WHO_LICENSE } from './check-comparison-projections.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  const args = process.argv.slice(2), options = {}
  const allowed = ['--current', '--current-sha', '--historical', '--historical-sha', '--editions', '--editions-sha', '--canonical', '--canonical-sha']
  if (args.length !== 16) throw new Error('Supply explicit current/historical/editions/canonical files and their reviewed SHA256 values')
  for (let i=0;i<args.length;i+=2) {
    if (!allowed.includes(args[i]) || options[args[i]] || !args[i+1]) throw new Error('Unknown or duplicate input option')
    options[args[i]] = args[i+1]
  }
  const read = key => {
    const bytes = fs.readFileSync(options[`--${key}`])
    const expected = options[`--${key}-sha`]
    if (!/^[a-f0-9]{64}$/.test(expected || '') || crypto.createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Reviewed input SHA256 mismatch')
    return JSON.parse(bytes)
  }
  const current=read('current'), historical=read('historical'), editionInput=read('editions'), canonicalInput=read('canonical')
  if(canonicalInput.schema!=='openphar-native-canonical-proof/v1'||canonicalInput.model!=='Openphar::Models::CanonicalLimit'||!Array.isArray(canonicalInput.rows))throw new Error('Declared canonical model input required')
  const metadata = {
    attribution: editionInput.attribution,
    license: WHO_LICENSE,
    adaptation: 'Adapted by Open Pharmacopoeia: selected criteria structured as explicit limits and selected edition fields compared. Only supplied fields are assessed. Historical comparisons use captured edition material; original-PDF authentication is outside this comparison. Zidovudine compares captured native PhInt-12 and PhInt-13 records; original raw capture authentication is unavailable. Catalog families are citation lookups with unresolved applicability, not equivalence or interchangeability.',
    endorsement: 'No endorsement by WHO is implied.'
  }
  const facts={schema:'openphar-comparison/v1',...metadata,entries:[...readComparisonProjection(current),...readComparisonProjection(historical)]}
  const used=new Set()
  for(const entry of facts.entries)entry.tests=entry.tests.map(test=>{
    const matches=canonicalInput.rows.filter(row=>row.publisher===entry.publisher&&row.entryId===entry.entryId&&row.edition===entry.edition&&row.substanceId===entry.substanceId&&row.key===test.key)
    if(matches.length!==1)throw new Error('Canonical model identity/test match missing or ambiguous')
    const row=matches[0];used.add(row)
    const context={key:test.key,label:test.label,semanticKey:test.semanticKey,basis:test.basis,evidence:test.evidence,expectedSubject:test.label,expectedQualifier:test.basis}
    if(test.method)context.method=test.method
    const adapted=fromCanonicalLimit(row.canonical,context)
    if(JSON.stringify(adapted)!==JSON.stringify(test))throw new Error('Canonical adaptation differs from reviewed literal criteria')
    return adapted
  })
  if(used.size!==canonicalInput.rows.length)throw new Error('Unused canonical model rows')
  const editions={schema:'openphar-edition-diffs/v1',...metadata,records:readEditionProjection(editionInput)}
  if ([current,historical,editionInput].some(d => d.license !== WHO_LICENSE)) throw new Error('Source projection license mismatch')
  const result=validatePublicProjections(facts,editions,loadPublicIdentityInputs())
  const destination=path.join(root,'public/data');fs.mkdirSync(destination,{recursive:true})
  for(const [name,document] of [['comparison-facts.json',facts],['edition-diffs.json',editions]]) fs.writeFileSync(path.join(destination,name),JSON.stringify(document,null,2)+'\n')
  console.log(JSON.stringify({exit:0,...result}))
} catch(error) { console.error(error.message); process.exitCode=1 }
