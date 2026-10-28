import test from 'node:test'
import assert from 'node:assert/strict'
import { readComparisonProjection, findFacts, compareTests, compareDecimal, detailAccess, formatLimit, comparisonMatrix, resolveEntrySelection, fromCanonicalLimit } from '../src/lib/comparison-contract.js'
// Explicit contract fixtures, not source-derived scientific examples.
const make = (changes = {}) => ({ publisher: 'phint', entryId: 'https://www.openphar.org/data/phint/monographs/6-1-266', substanceId: 'paracetamol', edition: 'PhInt-13', publication: {status:'permitted', authority:'WHO International Pharmacopoeia 13th edition, CC BY-NC-SA 3.0 IGO'}, tests: [{key:'assay',label:'Assay',semanticKey:'assay-content',basis:'dried substance',unit:'%',limit:{operator:'range',lower:'99.0',upper:'101.0'},evidence:'WHO PhInt-13, Paracetamol, Assay'}], ...changes })
const doc = entry => ({schema:'openphar-comparison/v1',entries:[entry]})
test('matches complete explicit identity, never a reused numbered slug alone', () => {
 const entry=make(); const entries=readComparisonProjection(doc(entry)); assert.equal(findFacts(entries,{...entry,edition:'PhInt-12'}),null); assert.equal(findFacts(entries,{...entry,substanceId:'penicillamine'}),null); assert.equal(findFacts(entries,entry),entry)
})
test('reports exact numeric differences with no binary rounding or conversion', () => {
 const a=make(),b=make();b.tests[0].limit.lower='98.0';assert.equal(compareTests(a,a.tests[0],b,b.tests[0]).status,'different');b.tests[0].limit.lower='99.00';assert.equal(compareTests(a,a.tests[0],b,b.tests[0]).status,'same');assert.equal(compareDecimal('999999999999999999.1','999999999999999999.2'),-1);assert.equal(compareDecimal('-0.10','-0.1'),0);assert.equal(formatLimit(a.tests[0]),'99.0–101.0 %')
})
test('incompatible units, bases, identities and operators stay incomparable', () => {
 for(const mutation of [e=>e.tests[0].unit='mg/g',e=>e.tests[0].basis='anhydrous substance',e=>e.tests[0].semanticKey='water',e=>e.substanceId='another-substance',e=>e.tests[0].limit={operator:'>=',value:'99'}]) { const a=make(),b=make();mutation(b);assert.equal(compareTests(a,a.tests[0],b,b.tests[0]).status,'incomparable') }
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
