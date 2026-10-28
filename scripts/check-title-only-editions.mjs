import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readTitleOnlyEditions } from '../src/lib/title-only-editions.js'
import { resolveEntrySelection } from '../src/lib/comparison-contract.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const cache=new Map()
const fail=reason=>{throw new Error(`Title-only publication gate: ${reason}`)}
export function validateTitleOnlyBindings(document,{registry,index,graph}) {
  readTitleOnlyEditions(document)
  if (!Object.keys(document.bySubstance).length) fail('empty index')
  const owners=new Map()
  for(const substance of registry)for(const occurrence of substance.occurrences||[]){
    const key=JSON.stringify([occurrence.publisher,occurrence.entry,occurrence.edition])
    if(!owners.has(key))owners.set(key,new Set())
    owners.get(key).add(substance.id)
  }
  let count=0
  for(const [id,records] of Object.entries(document.bySubstance)){
    const identities=registry.filter(record=>record.id===id)
    if(identities.length!==1)fail('unknown or ambiguous public stable identity')
    const substance=identities[0]
    const names=new Set(substance.names_by_publisher?.USP||[])
    for(const record of records){
      const matches=owners.get(JSON.stringify(['USP',record['@id'],record.edition]))
      if(matches?.size!==1||!matches.has(id))fail('native identity/edition binding mismatch')
      if(!names.has(record.prefLabel.en))fail('title absent from public registry')
      if(record.casNumber&&record.casNumber!==substance.identifiers?.cas_rn)fail('CAS metadata mismatch')
      count++
    }
    const indexed=index.filter(row=>row.d==='us'&&row.sub===id)
    const editions=new Set(records.map(record=>record.edition))
    const current=graph.filter(entry=>editions.has(entry.edition)&&indexed.some(row=>row.s===(entry['@id']||'').split('/').pop()&&row.c===entry.category))
    if(current.length!==1)fail('ambiguous current public entry')
    const entry=current[0],slug=entry['@id'].split('/').pop()
    const resolved=resolveEntrySelection(graph,index,{publisher:'us',slug,category:entry.category})
    if(!resolved||resolved.substanceId!==id)fail('current category/index identity mismatch')
    if(records.some(record=>record.category&&record.category!==entry.category))fail('category metadata mismatch')
  }
  return {substances:Object.keys(document.bySubstance).length,titleEntries:count}
}
export function loadTitleContext(directory=root) {
  if(!cache.has(directory)){
    const read=relative=>JSON.parse(fs.readFileSync(path.join(directory,relative),'utf8'))
    cache.set(directory,{registry:fs.readFileSync(path.join(directory,'data/downloads/substances.ndjson'),'utf8').trim().split('\n').map(line=>JSON.parse(line)),index:read('data/search-index.json'),graph:read('data/us/us-monographs.jsonld')['@graph']})
  }
  return cache.get(directory)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const document=JSON.parse(fs.readFileSync(path.join(root,'public/data/us-editions.json'),'utf8'));console.log(JSON.stringify({exit:0,...validateTitleOnlyBindings(document,loadTitleContext())}))}
 catch(error){console.error(error.message);process.exitCode=1}
}
