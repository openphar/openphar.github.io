import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validatePublicProjections, loadPublicIdentityInputs } from './check-comparison-projections.mjs'
import { compareTests } from '../src/lib/comparison-contract.js'
const read=name=>JSON.parse(fs.readFileSync(new URL(`../public/data/${name}`,import.meta.url),'utf8'))
const facts=read('comparison-facts.json'),editions=read('edition-diffs.json'),identity=loadPublicIdentityInputs()
const copy=()=>[structuredClone(facts),structuredClone(editions)]
test('actual reviewed public WHO projection has11current+3historical entries,18limits,11citations and9catalog families',()=>{
 assert.deepEqual(validatePublicProjections(facts,editions,identity),{currentEntries:11,historicalEntries:3,tests:18,methods:11,catalogFamilies:9,unresolvedCatalogReferences:2,editionPairs:3,changes:4})
 const pair=(sub,edition)=>facts.entries.find(e=>e.substanceId===sub&&e.edition===edition)
 for(const [sub,old,status] of [['albendazole','PhInt-11','different'],['paracetamol','PhInt-12','same']]){const a=pair(sub,old),b=pair(sub,'PhInt-13');const assay=e=>e.tests.find(t=>t.semanticKey==='active-substance-content');assert.equal(compareTests(a,assay(a),b,assay(b)).status,status)}
})
test('rejects restricted, held and unapproved publishers despite permitted flag',()=>{for(const publisher of ['us','eu','uk','jp','chp','kp','unknown']){const [f,e]=copy();f.entries[0].publisher=publisher;assert.throws(()=>validatePublicProjections(f,e,identity))}})
test('strict nested allowlists exclude raw/private body fields and local paths',()=>{for(const mutation of [f=>f.raw='PRIVATE_SENTINEL',f=>f.entries[0].definition='PRIVATE_SENTINEL',f=>f.entries[0].tests[0].source_yaml='PRIVATE_SENTINEL',f=>f.entries[0].tests[0].limit.raw='PRIVATE_SENTINEL',f=>f.entries[0].tests[0].evidence='/home/example/private/source.yaml',f=>f.attribution='.codex-context/evidence/proof.json']){const[f,e]=copy();mutation(f);assert.throws(()=>validatePublicProjections(f,e,identity))}})
test('citations cannot smuggle unapproved harmonized mapping fields into any projection layer',()=>{
 for(const field of ['method_concept_iri','mapping','applicability','rationale','ich_q4b_status','regional_chapters','non_interchangeable_cases']) {
  for(const layer of [f=>f,f=>f.entries[0],f=>f.entries.flatMap(e=>e.tests).find(t=>t.method),f=>f.entries.flatMap(e=>e.tests).find(t=>t.method).method]) {
   const[f,e]=copy();layer(f)[field]='PRIVATE_MAPPING_SENTINEL';assert.throws(()=>validatePublicProjections(f,e,identity))
  }
  const[f,e]=copy();e.records[0][field]='PRIVATE_MAPPING_SENTINEL';assert.throws(()=>validatePublicProjections(f,e,identity))
 }
})
test('actual WHO inequalities retain their literal units and no conversion is inferred',()=>{
 const entry=facts.entries.find(e=>e.substanceId==='paracetamol'&&e.edition==='PhInt-13')
 for(const [key,value] of [['sulfated-ash','1.0'],['loss-on-drying','5.0']]) {
  const datum=entry.tests.find(t=>t.key===key);assert.equal(datum.unit,'mg/g');assert.deepEqual(datum.limit,{operator:'<=',value})
  const other=structuredClone(entry);other.tests.find(t=>t.key===key).unit='%'
  assert.equal(compareTests(entry,datum,other,other.tests.find(t=>t.key===key)).status,'incomparable')
 }
})
test('current registry/category identity and historical same-substance endpoints are mandatory',()=>{for(const mutation of [(f,e)=>f.entries[0].substanceId='different-substance',(f,e)=>e.records[0].from.substanceId='penicillamine',(f,e)=>f.entries.find(x=>x.edition==='PhInt-12').entryId='https://openphar.org/data/phint/phint-12/entry/unverified',(f,e)=>e.records[0].to.entryId='https://www.openphar.org/data/phint/monographs/not-current']){const[f,e]=copy();mutation(f,e);assert.throws(()=>validatePublicProjections(f,e,identity))}})
test('missing WHO notices, unverified differences and empty-data success are rejected',()=>{for(const mutation of [(f,e)=>delete f.adaptation,(f,e)=>e.records[1].status='unverified',(f,e)=>e.records[1].changes[0].raw_pdf='PRIVATE_SENTINEL',(f,e)=>f.entries=[]]){const[f,e]=copy();mutation(f,e);assert.throws(()=>validatePublicProjections(f,e,identity))}})
test('public output requires explicit catalog uncertainty and the captured-native limitation',()=>{
 for(const mutation of [f=>delete f.entries.flatMap(e=>e.tests).find(t=>t.method).method.catalog,f=>f.adaptation=f.adaptation.replace('original raw capture authentication is unavailable','original source authenticated')]){
  const[f,e]=copy();mutation(f);assert.throws(()=>validatePublicProjections(f,e,identity))
 }
})
