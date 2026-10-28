import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readTitleOnlyEditions,titleEditionsFor } from '../src/lib/title-only-editions.js'
import { validateTitleOnlyBindings,loadTitleContext } from './check-title-only-editions.mjs'
const document=JSON.parse(fs.readFileSync(new URL('../public/data/us-editions.json',import.meta.url),'utf8'))
const context=loadTitleContext(),copy=()=>structuredClone(document)
test('four actual USP title editions bind to the existing public registry identity',()=>{
 assert.deepEqual(validateTitleOnlyBindings(document,context),{substances:1,titleEntries:4})
 assert.deepEqual(document.bySubstance.paracetamol.map(r=>r.edition),['2015-USP38-NF33','2023-USP46-NF41','2024-USP47-NF42','2025-USP48-NF43'])
 const identity={publisher:'us',substanceId:'paracetamol',entryId:'https://www.openphar.org/data/us/monographs/acetaminophen',edition:'2025-USP48-NF43'}
 assert.equal(titleEditionsFor(document,identity,context).length,4)
 for(const mutation of [{publisher:'eu'},{substanceId:'unverified'},{edition:'unsupported'},{entryId:'https://www.openphar.org/data/us/monographs/another'}])assert.equal(titleEditionsFor(document,{...identity,...mutation},context).length,0)
})
test('only navigation envelope and six-key title metadata can pass',()=>{
 for(const key of ['definition','tests','limits','diff','changes','counts','raw_text','source_ref']){const d=copy();d.bySubstance.paracetamol[0][key]='FORBIDDEN';assert.throws(()=>readTitleOnlyEditions(d))}
 for(const mutation of [d=>d.diffCounts={},d=>d.bySubstance.paracetamol[0].prefLabel.body='FORBIDDEN',d=>d.bySubstance.paracetamol[0].edition='/home/example/private.yaml',d=>d.bySubstance.paracetamol[0]['@id']='https://openphar.org/data/phint/phint-12/entry/6-1-266']){const d=copy();mutation(d);assert.throws(()=>readTitleOnlyEditions(d))}
})
test('native IRI/edition and public stable identity are checked without slug inference',()=>{
 for(const mutation of [d=>d.bySubstance.unknown=d.bySubstance.paracetamol,d=>d.bySubstance.paracetamol[0].edition='2025-USP48-NF43',d=>d.bySubstance.paracetamol[0].prefLabel.en='Different title',d=>d.bySubstance.paracetamol.push({...d.bySubstance.paracetamol[0]}),d=>d.bySubstance.paracetamol[0].casNumber='50-00-0']){const d=copy();mutation(d);assert.throws(()=>validateTitleOnlyBindings(d,context))}
 const occurrence=context.registry.find(r=>r.id==='paracetamol').occurrences.find(r=>r.publisher==='USP')
 assert.throws(()=>validateTitleOnlyBindings(document,{...context,registry:[...context.registry,{id:'conflicting-id',occurrences:[occurrence]}]}),/binding mismatch/)
 assert.throws(()=>validateTitleOnlyBindings({schema:document.schema,bySubstance:{}},context),/empty index/)
})
