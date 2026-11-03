import test from 'node:test'
import assert from 'node:assert/strict'
import { compareColumnLabel } from '../src/lib/compare-column-label.js'
test('column label joins publisher and edition', () => assert.equal(compareColumnLabel({ d: 'kp', edition: 'KP13' }), 'KP · KP13'))
test('column label omits separator when edition is missing', () => {
  for (const edition of ['', '  ', undefined, null]) assert.equal(compareColumnLabel({ d: 'jp', edition }), 'JP')
})
