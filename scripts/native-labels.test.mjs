import test from 'node:test'
import assert from 'node:assert/strict'
import { labelsOf, nativeLabelOf, titleLabelOf } from './native-labels.mjs'

test('API labels distinguish IAST, confirmed Devanagari, and real Latin names', () => {
  const doc = {
    names: {
      canonical: { en: 'Example herb', iast: 'Udāharaṇa', latin: 'Examplea herba', devanagari: 'उदाहरण' },
      native_name_sources: { devanagari: { status: 'source_confirmed' } }
    }
  }
  assert.deepEqual(labelsOf(doc, 'API'), {
    en: 'Example herb',
    'sa-Latn': 'Udāharaṇa',
    la: 'Examplea herba',
    'sa-Deva': 'उदाहरण'
  })
})

test('IAST remains the fallback title label when English is absent', () => {
  const labels = labelsOf({ names: { canonical: { iast: 'Udāharaṇa', latin: 'Examplea herba' } } }, 'API')
  assert.equal(titleLabelOf(labels, 'API'), 'Udāharaṇa')
  assert.equal(titleLabelOf({ 'sa-Latn': 'Udāharaṇa' }, 'API'), 'Udāharaṇa')
})

test('only approved source statuses expose Devanagari and labels contain no provenance', () => {
  for (const status of ['page_read_confirmed', 'page_read_source_variant']) {
    const labels = labelsOf({
      names: {
        canonical: { iast: 'Udāharaṇa', devanagari: 'उदाहरण' },
        native_name_sources: { devanagari: { status, source_file: 'private.pdf', source_sha256: 'secret' } }
      }
    }, 'API')
    assert.equal(labels['sa-Deva'], 'उदाहरण')
    assert.equal(labels['sa-Latn'], 'Udāharaṇa')
    assert.equal(JSON.stringify(labels).includes('source_file'), false)
    assert.equal(JSON.stringify(labels).includes('source_sha256'), false)
  }
  for (const status of ['unsupported', 'no_source', 'discrepant', 'unreviewed']) {
    const labels = labelsOf({
      names: {
        canonical: { iast: 'Udāharaṇa', devanagari: 'उदाहरण' },
        native_name_sources: { devanagari: { status } }
      }
    }, 'API')
    assert.equal(labels['sa-Deva'], undefined)
    assert.equal(labels['sa-Latn'], 'Udāharaṇa')
  }
  const misplacedStatus = labelsOf({
    names: { canonical: { iast: 'Udāharaṇa', devanagari: 'उदाहरण' } },
    native_name_sources: { devanagari: { status: 'source_confirmed' } }
  }, 'API')
  assert.equal(misplacedStatus['sa-Deva'], undefined)
})

test('native search label prefers Devanagari and falls back to first existing non-English label', () => {
  assert.equal(nativeLabelOf({ en: 'Example', 'sa-Latn': 'Udāharaṇa', 'sa-Deva': 'उदाहरण' }), 'उदाहरण')
  assert.equal(nativeLabelOf({ en: 'Example', 'sa-Latn': 'Udāharaṇa' }), 'Udāharaṇa')
  assert.equal(nativeLabelOf({ en: 'Example', ko: '예시', zh: '示例' }), '예시')
})

test('non-API label behavior remains unchanged', () => {
  assert.deepEqual(labelsOf({
    title: { english: 'Example', latin: 'Exemplum', zh: '示例', ko: '예시' },
    names: { canonical: { iast: 'Ignored canonical IAST', latin: 'Exemplum' } }
  }, 'USP'), { en: 'Example', la: 'Exemplum', zh: '示例', ko: '예시' })
})
