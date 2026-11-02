import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readComparisonProjection, findFacts, compareTests, compareMethods, compareDecimal, detailAccess, formatLimit, comparisonMatrix, resolveEntrySelection, fromCanonicalLimit, bindPublicIdentitySearchIndex } from '../src/lib/comparison-contract.js'
// Explicit contract fixtures, not source-derived scientific examples.
const make = (changes = {}) => ({ publisher: 'phint', entryId: 'https://www.openphar.org/data/phint/monographs/6-1-266', substanceId: 'paracetamol', edition: 'PhInt-13', publication: {status:'permitted', authority:'WHO International Pharmacopoeia 13th edition, CC BY-NC-SA 3.0 IGO'}, tests: [{key:'assay',label:'Assay',semanticKey:'assay-content',basis:'dried substance',unit:'%',limit:{operator:'range',lower:'99.0',upper:'101.0'},evidence:'WHO PhInt-13, Paracetamol, Assay'}], ...changes })
const doc = entry => ({schema:'openphar-comparison/v1',entries:[entry]})
const actualFacts = () => readComparisonProjection(JSON.parse(fs.readFileSync(new URL('../public/data/comparison-facts.json', import.meta.url), 'utf8')))

test('actual captured Zidovudine pair differs in both literal upper bound and cited technique', () => {
 const entries=actualFacts(), current=entries.find(e=>e.substanceId==='zidovudine'&&e.edition==='PhInt-13'), earlier=entries.find(e=>e.substanceId==='zidovudine'&&e.edition==='PhInt-12')
 assert.equal(compareTests(current,current.tests[0],earlier,earlier.tests[0]).status,'different')
 assert.equal(compareMethods(current,current.tests[0],earlier,earlier.tests[0]).status,'different-citation')
 assert.equal(current.tests[0].method.chapter,'1.14.1');assert.equal(earlier.tests[0].method.chapter,'1.6')
 assert.equal(current.tests[0].method.catalog.status,'unresolved')
 assert.equal(earlier.tests[0].method.catalog.family,'uv_vis_spectrophotometry')
 assert.equal(earlier.tests[0].method.catalog.applicability,'unresolved')
})

test('actual unchanged Paracetamol citation does not establish unchanged procedure or equivalence', () => {
 const entries=actualFacts(), current=entries.find(e=>e.substanceId==='paracetamol'&&e.edition==='PhInt-13'), earlier=entries.find(e=>e.substanceId==='paracetamol'&&e.edition==='PhInt-12')
 const result=compareMethods(current,current.tests[0],earlier,earlier.tests[0]);assert.equal(result.status,'same-citation');assert.match(result.reason,/not established/)
})

test('actual typed limits without citations never become reference method citations', () => {
 const entries=actualFacts().filter(e=>e.substanceId==='paracetamol')
 const rows=comparisonMatrix(entries.map(facts=>({facts})))
 for(const row of rows.filter(r=>r.cells.every(c=>!c.test?.method)))assert(row.cells.every(c=>c.methodComparison.status==='unknown'))
 assert(rows.some(r=>r.cells.every(c=>!c.test?.method)))
})

test('method comparison rejects different identities, missing citations and borrowed catalog editions', () => {
 const entries=actualFacts(), current=entries.find(e=>e.substanceId==='zidovudine'&&e.edition==='PhInt-13'), earlier=entries.find(e=>e.substanceId==='zidovudine'&&e.edition==='PhInt-12'), other=entries.find(e=>e.substanceId==='paracetamol'&&e.edition==='PhInt-13')
 assert.equal(compareMethods(current,current.tests[0],other,other.tests[0]).status,'incomparable')
 const missing=structuredClone(earlier);delete missing.tests[0].method;assert.equal(compareMethods(current,current.tests[0],missing,missing.tests[0]).status,'unknown')
 const borrowed=structuredClone(earlier);borrowed.edition='PhInt-13';assert.equal(compareMethods(current,current.tests[0],borrowed,borrowed.tests[0]).status,'unknown')
})
test('matches complete explicit identity, never a reused numbered slug alone', () => {
 const entry=make(); const entries=readComparisonProjection(doc(entry)); assert.equal(findFacts(entries,{...entry,edition:'PhInt-12'}),null); assert.equal(findFacts(entries,{...entry,substanceId:'penicillamine'}),null); assert.equal(findFacts(entries,entry),entry)
})
test('reports exact numeric differences with no binary rounding or conversion', () => {
 const a=make(),b=make();b.tests[0].limit.lower='98.0';assert.equal(compareTests(a,a.tests[0],b,b.tests[0]).status,'different');b.tests[0].limit.lower='99.00';assert.equal(compareTests(a,a.tests[0],b,b.tests[0]).status,'same');assert.equal(compareDecimal('999999999999999999.1','999999999999999999.2'),-1);assert.equal(compareDecimal('-0.10','-0.1'),0);assert.equal(formatLimit(a.tests[0]),'99.0–101.0 %')
})
test('incompatible units, bases, identities and operators stay incomparable', () => {
 for(const mutation of [e=>e.tests[0].unit='mg/g',e=>e.tests[0].basis='anhydrous substance',e=>e.tests[0].semanticKey='water',e=>e.substanceId='another-substance',e=>e.tests[0].limit={operator:'>=',value:'99'}]) { const a=make(),b=make();mutation(b);assert.equal(compareTests(a,a.tests[0],b,b.tests[0]).status,'incomparable') }
})
test('missing identity, unknown scope and incomplete scientific data remain unknown without throwing', () => {
 const unknown={semanticKey:'unknown',basis:'unknown',unit:'unknown',limit:{operator:'<=',value:'1'}}
 assert.equal(compareTests({},unknown,{},unknown).status,'unknown')
 for(const mutation of [e=>delete e.substanceId,e=>delete e.edition,e=>delete e.publication,e=>e.publication.status='unverified',e=>e.publisher='us',e=>e.tests[0].basis='unknown',e=>e.tests[0].unit='not stated',e=>e.tests[0].semanticKey='unspecified',e=>delete e.tests[0].limit.lower,e=>e.tests[0].limit.lower='1e2',e=>e.tests[0].limit.lower='102',e=>e.tests[0].limit.operator='unknown']) {
  const a=make(),b=make();mutation(b)
  assert.equal(compareTests(a,a.tests[0],b,b.tests[0]).status,'unknown')
 }
 assert.equal(compareTests(make(),undefined,make(),undefined).status,'unknown')
})
test('literal scalar inequalities compare only with the same operator, unit and basis', () => {
 for(const operator of ['<','<=','=','>=','>']) {
  const a=make(),b=make();a.tests[0].limit={operator,value:'1.00'};b.tests[0].limit={operator,value:'1.0'}
  assert.equal(compareTests(a,a.tests[0],b,b.tests[0]).status,'same')
  b.tests[0].limit.value='1.01';assert.equal(compareTests(a,a.tests[0],b,b.tests[0]).status,'different')
  assert.equal(formatLimit(b.tests[0]),`${operator} 1.01 %`)
 }
})
test('unavailable cells carry an explicit unknown state and restricted columns retain identity', () => {
 const columns=[{key:'us',access:'title-only',title:'Acetaminophen',facts:null},{key:'phint',facts:make()}]
 const row=comparisonMatrix(columns)[0]
 assert.equal(row.cells.length,2);assert.equal(row.cells[0].comparison.status,'unknown')
 assert.equal(row.cells[0].column.title,'Acetaminophen');assert.equal(row.cells[1].comparison.status,'incomparable')
})
test('hard publisher gates cannot be overridden by a permitted flag', () => {
 for(const publisher of ['us','eu','uk','jp','chp','ich','unknown','USP']) assert.throws(()=>readComparisonProjection(doc(make({publisher}))),/publisher detail policy/)
 assert.equal(detailAccess('phint','title-only'),'title-only')
})
test('rejects prose, missing evidence, malformed decimals, reversed ranges and duplicate identities', () => {
 for(const mutation of [e=>e.tests[0].limit.value='about 2',e=>e.tests[0].limit.lower='1e2',e=>e.tests[0].limit.lower='102',e=>e.tests[0].evidence='/home/apple/private/source.yaml',e=>delete e.publication.authority,e=>e.tests.push({...e.tests[0]}),e=>e.tests[0].method={chapter:'2.1'}]) {const e=make();mutation(e);if(e.tests[0].limit.value)e.tests[0].limit={operator:'=',value:e.tests[0].limit.value};assert.throws(()=>readComparisonProjection(doc(e)))}
 assert.throws(()=>readComparisonProjection({schema:'openphar-comparison/v1',entries:[make(),make()]}),/duplicate entry/)
})

test('one value is unavailable for comparison; ambiguous semantic variants stay explicit',()=>{const facts=make();const rows=comparisonMatrix([{facts}]);assert.equal(rows[0].cells[0].comparison.status,'incomparable');assert.match(rows[0].cells[0].comparison.reason,/Only one/);facts.tests.push({...facts.tests[0],key:'another-variant'});assert.equal(comparisonMatrix([{facts}])[0].cells[0].ambiguous,true)})
test('category participates in graph/index identity and ambiguous reused slugs fail closed',()=>{const graph=[{'@id':'https://www.openphar.org/data/phint/monographs/reused',category:'monographs',edition:'PhInt-13'},{'@id':'https://www.openphar.org/data/phint/general-tests/reused',category:'general-tests',edition:'PhInt-13'}];const index=[{d:'phint',s:'reused',c:'monographs',sub:'one'},{d:'phint',s:'reused',c:'general-tests',sub:'two'}];assert.equal(resolveEntrySelection(graph,index,{publisher:'phint',slug:'reused'}),null);assert.equal(resolveEntrySelection(graph,index,{publisher:'phint',slug:'reused',category:'general-tests'}).substanceId,'two');assert.equal(resolveEntrySelection(graph,[...index,{...index[1],sub:'conflict'}],{publisher:'phint',slug:'reused',category:'general-tests'}),null)})

test('current public identity entries restore only unambiguous in-memory search joins',()=>{
 const rows=[{d:'phint',s:'6-1-266',c:'monographs',t:'Paracetamol',k:1},{d:'us',s:'acetaminophen',c:'monographs',t:'Acetaminophen',k:0}]
 const records=[{id:'paracetamol',entries:[{d:'phint',s:'6-1-266',c:'monographs',edition:'PhInt-13'},{d:'us',s:'acetaminophen',c:'monographs',edition:'2025-USP48-NF43'}]}]
 const bound=bindPublicIdentitySearchIndex(rows,records)
 assert.deepEqual(bound.map(row=>row.sub),['paracetamol','paracetamol'])
 const graph=[{'@id':'https://www.openphar.org/data/phint/monographs/6-1-266',edition:'PhInt-13'}]
 assert.equal(resolveEntrySelection(graph,bound,{publisher:'phint',slug:'6-1-266',category:'monographs'}).substanceId,'paracetamol')
 assert.equal(resolveEntrySelection([{...graph[0],edition:'PhInt-12'}],bound,{publisher:'phint',slug:'6-1-266',category:'monographs'}),null)
 const ambiguous=bindPublicIdentitySearchIndex(rows,[...records,{id:'another-substance',entries:[records[0].entries[0]]}])
 assert.equal(resolveEntrySelection(graph,ambiguous,{publisher:'phint',slug:'6-1-266',category:'monographs'}),null)
 const conflict=bindPublicIdentitySearchIndex([{...rows[0],sub:'wrong-id'}],records)
 assert.equal(conflict[0].sub,'')
 const stale={...rows[0],sub:'old-index-id'}
 assert.equal(bindPublicIdentitySearchIndex([stale],[])[0].sub,'')
 assert.equal(stale.sub,'old-index-id','the published/search input row is not mutated')
})

// Captured from actual declared CanonicalLimit serialization for the public WHO criterion.
const nativeCanonical={"limit_operator": "range", "lower_limit": "98.5", "upper_limit": "101.0", "limit_unit": "%", "limit_subject": "Paracetamol content", "limit_qualifier": "C8H9NO2; calculated with reference to the dried substance"}
test('declared native canonical JSON adapts losslessly with explicit semantic context',()=>{
 const context={key:'assay-content',label:'Paracetamol content',semanticKey:'active-substance-content',basis:nativeCanonical.limit_qualifier,evidence:'WHO PhInt-13 Paracetamol Definition',expectedSubject:nativeCanonical.limit_subject,expectedQualifier:nativeCanonical.limit_qualifier}
 const adapted=fromCanonicalLimit(nativeCanonical,context);assert.deepEqual(adapted.limit,{operator:'range',lower:'98.5',upper:'101.0'});assert.equal(adapted.unit,'%');assert.equal(adapted.basis,nativeCanonical.limit_qualifier)
 assert.throws(()=>fromCanonicalLimit(nativeCanonical,{...context,expectedQualifier:'anhydrous basis'}),/explicit context/)
 assert.throws(()=>fromCanonicalLimit({...nativeCanonical,limit_operator:'unknown'},context))
 assert.throws(()=>fromCanonicalLimit({...nativeCanonical,raw_text:'FORBIDDEN'},context))
 assert.throws(()=>fromCanonicalLimit({...nativeCanonical,limit_value:'99'},context),/conflicting/)
})
