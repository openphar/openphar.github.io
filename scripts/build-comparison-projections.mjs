// Explicit reviewed input files only: no source discovery, corpus parser or network.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readComparisonProjection } from '../src/lib/comparison-contract.js'
import { readEditionProjection } from '../src/lib/edition-diff.js'
import { validatePublicProjections, loadPublicIdentityInputs, WHO_LICENSE } from './check-comparison-projections.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  const args = process.argv.slice(2), options = {}
  const allowed = ['--current', '--current-sha', '--historical', '--historical-sha', '--editions', '--editions-sha']
  if (args.length !== 12) throw new Error('Supply explicit current/historical/editions files and their reviewed SHA256 values')
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
  const current=read('current'), historical=read('historical'), editionInput=read('editions')
  const metadata = {
    attribution: editionInput.attribution,
    license: WHO_LICENSE,
    adaptation: 'Adapted by Open Pharmacopoeia: selected criteria structured as explicit limits and selected edition fields compared. Only supplied fields are assessed. Historical comparisons use captured edition material; original-PDF authentication is outside this comparison.',
    endorsement: 'No endorsement by WHO is implied.'
  }
  const facts={schema:'openphar-comparison/v1',...metadata,entries:[...readComparisonProjection(current),...readComparisonProjection(historical)]}
  const editions={schema:'openphar-edition-diffs/v1',...metadata,records:readEditionProjection(editionInput)}
  if ([current,historical,editionInput].some(d => d.license !== WHO_LICENSE)) throw new Error('Source projection license mismatch')
  const result=validatePublicProjections(facts,editions,loadPublicIdentityInputs())
  const destination=path.join(root,'public/data');fs.mkdirSync(destination,{recursive:true})
  for(const [name,document] of [['comparison-facts.json',facts],['edition-diffs.json',editions]]) fs.writeFileSync(path.join(destination,name),JSON.stringify(document,null,2)+'\n')
  console.log(JSON.stringify({exit:0,...result}))
} catch(error) { console.error(error.message); process.exitCode=1 }
