import assert from 'node:assert/strict'
import test from 'node:test'
import { formatBrowserFailure } from '../tests/browser/failure-report.mjs'

test('browser failure report surfaces late failures rather than preceding PASS results', () => {
  const results = Array.from({ length: 600 }, (_, index) => ({ name: `pass ${index}`, status: 'PASS' }))
  results.push({ name: 'last regression', status: 'FAIL', error: 'actual failure witness' })
  const report = JSON.parse(formatBrowserFailure(JSON.stringify(results)))
  assert.equal(report.total, 601)
  assert.equal(report.failed, 1)
  assert.deepEqual(report.failures, [results.at(-1)])
})

test('browser failure report retains fallback text and bounds console output', () => {
  assert.equal(formatBrowserFailure('page failed before results'), 'page failed before results')
  assert.equal(formatBrowserFailure(undefined), 'summary unavailable')
  const cases = Array.from({ length: 100 }, () => ({ name: 'x'.repeat(1000), status: 'FAIL', error: 'x'.repeat(10000) }))
  const report = JSON.parse(formatBrowserFailure(JSON.stringify(cases)))
  assert.equal(report.failed, 100)
  assert.equal(report.failures.length, 20)
  assert.equal(report.failures[0].error.length, 2000)
  assert(formatBrowserFailure(JSON.stringify(cases)).length < 60000)
})
