import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readTitleOnlyEditions } from '../src/lib/title-only-editions.js'
import { resolveEntrySelection, bindPublicIdentitySearchIndex } from '../src/lib/comparison-contract.js'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const cache=new Map()
const fail=reason=>{throw new Error(`Title-only publication gate: ${reason}`)}
export function validateTitleOnlyBindings(document,{registry,index,graph}) {
  readTitleOnlyEditions(document)
  if (!Object.keys(document.bySubstance).length) fail('empty index')
  const owners=new Map()
  for(const substance of registry){
    for(const occurrence of substance.occurrences||[]){
      const key=JSON.stringify([occurrence.publisher,occurrence.entry,occurrence.edition])
      if(!owners.has(key))owners.set(key,new Set())
      owners.get(key).add(substance.id)
    }
  }
  const currentOwners=new Map()
  for(const substance of registry)for(const entry of substance.entries||[]){
    if(entry.d!=='us')continue
    const key=JSON.stringify([entry.d,entry.s,entry.c]),owner=currentOwners.get(key)
    if(owner&&owner!==substance.id)fail('ambiguous current identity/title binding')
    currentOwners.set(key,substance.id)
  }
  let count=0
  for(const [id,records] of Object.entries(document.bySubstance)){
    const identities=registry.filter(record=>record.id===id)
    if(identities.length!==1)fail('unknown or ambiguous public stable identity')
    const substance=identities[0]
    const names=new Set([...(substance.names_by_publisher?.USP||[]),substance.preferred_name?.en].filter(Boolean))
    const currentEntries=(substance.entries||[]).filter(entry=>entry.d==='us')
    for(const record of records){
      const native=record['@id'].match(/^https:\/\/openphar\.org\/data\/usp\/([^/]+)\/entry\/([^/]+)$/)
      if(!native||native[1]!==record.edition.toLowerCase())fail('native identity/edition binding mismatch')
      const exactOwners=owners.get(JSON.stringify(['USP',record['@id'],record.edition]))
      if(exactOwners){
        if(exactOwners.size!==1||!exactOwners.has(id))fail('native identity/edition binding mismatch')
      }else{
        // The current public identity download intentionally carries current
        // `entries`, not private/historical `occurrences`. Bind each historical
        // title record to that stable substance and current US route, while
        // requiring its edition token to match its explicit native IRI.
        const candidates=currentEntries.filter(entry=>entry.s===native[2]&&(!record.category||entry.c===record.category))
        if(candidates.length!==1||!names.has(record.prefLabel.en)||record.prefLabel.en!==candidates[0].t)fail('current public identity/title binding mismatch')
      }
      if(!names.has(record.prefLabel.en))fail('title absent from public registry')
      const cas=substance.identifiers?.cas_rn
      if(record.casNumber&&record.casNumber!==cas)fail('CAS metadata mismatch')
      count++
    }
    const indexed=index.filter(row=>row.d==='us'&&row.sub===id)
    if(!indexed.length)fail('current identity/search binding mismatch')
    const editions=new Set(records.map(record=>record.edition))
    const current=graph.filter(entry=>editions.has(entry.edition)&&indexed.some(row=>row.s===(entry['@id']||'').split('/').pop()&&row.c===entry.category))
    if(current.length!==1)fail('ambiguous current public entry')
    const entry=current[0],slug=entry['@id'].split('/').pop()
    const resolved=resolveEntrySelection(graph,index,{publisher:'us',slug,category:entry.category})
    if(!resolved||(resolved.substanceId&&resolved.substanceId!==id))fail('current category/index identity mismatch')
    if(records.some(record=>record.category&&record.category!==entry.category))fail('category metadata mismatch')
  }
  return {substances:Object.keys(document.bySubstance).length,titleEntries:count}
}
export function loadTitleContext(directory=root) {
  if(!cache.has(directory)){
    const read=relative=>JSON.parse(fs.readFileSync(path.join(directory,relative),'utf8'))
    const registry=fs.readFileSync(path.join(directory,'data/downloads/substances.ndjson'),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))
    cache.set(directory,{registry,index:bindPublicIdentitySearchIndex(read('data/search-index.json'),registry),graph:read('data/us/us-monographs.jsonld')['@graph']})
  }
  return cache.get(directory)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const document=JSON.parse(fs.readFileSync(path.join(root,'public/data/us-editions.json'),'utf8'));console.log(JSON.stringify({exit:0,...validateTitleOnlyBindings(document,loadTitleContext())}))}
 catch(error){console.error(error.message);process.exitCode=1}
}
