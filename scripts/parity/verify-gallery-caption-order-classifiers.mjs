// Offline controls consume the actual raw three-source run, not constructed
// snapshots of the classifier's own model. They never launch a browser.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { classifyGalleryCaptionOrderDifference as classify, classifyGalleryCaptionOrderErrors as classifyErrors } from './gallery-caption-order-classifiers.mjs'
import { galleryCaptionOrderCases } from '../../tests/browser/gallery-caption-order-fixture.js'

assert(process.argv[2], 'Pass a complete gallery-caption-order.mjs JSON result')
const raw = JSON.parse(await readFile(process.argv[2], 'utf8'))
assert.deepEqual(raw.results.map(source => source.source), ['v1', 'spec-baseline', 'candidate'])
assert.equal(raw.sourceIdentityVerified, true)
assert.equal(raw.sourceUnchanged, true)
const clone = value => structuredClone(value)
let positive = 0, negative = 0, pageErrorNegative = 0
for (const source of raw.results) {
  assert.deepEqual(source.cases.map(entry => entry.id), galleryCaptionOrderCases.map(entry => entry.id))
  for (const entry of source.cases) {
    assert.deepEqual(entry.incompletePhases, [])
    if (source.source === 'candidate') assert.equal(entry.failures.length, 0, 'The candidate must have zero raw failures')
    for (const failure of entry.failures) {
      assert(classify(source.source, entry, failure), 'Unrecognized historical observation')
      positive++
      for (const label of ['candidate', 'unrecognized-reference']) {
        assert.equal(classify(label, entry, failure), null); negative++
      }
      for (const [key, value] of [['actual', 'unrecognized payload'], ['expected', 'weakened expectation'], ['phase', 'unexecuted-phase'], ['status', 'ERROR']]) {
        assert.equal(classify(source.source, entry, { ...failure, [key]: value }), null); negative++
      }
      for (const mutate of [
        copy => { copy.id += '-unrecognized' },
        copy => { copy.mode = 'unknown' },
        copy => { copy.completedPhases.pop() },
        copy => { copy.incompletePhases = ['dispose'] },
        copy => { copy.phases[0].blocks[1].data.images[0].caption += ' changed' },
        copy => { copy.phases[0].blocks[1].data.images.reverse() },
        copy => { copy.phases[0].blocks[0].data.text += ' changed neighbor' },
        copy => { copy.phases[0].blocks[1].inline = { foreign: { type: 'color', data: { value: '#abcdef' } } } },
        copy => { copy.phases[1].canUndo = false },
        copy => { copy.observations.find(value => value.property === 'trustedCaptionInput').actual[0].trusted = false },
        copy => { copy.observations.find(value => value.property === 'providerCalls').actual = 1 },
      ]) {
        const changed = clone(entry); mutate(changed)
        assert.equal(classify(source.source, changed, failure), null); negative++
      }
    }
  }
  const origin = source.errors[0]?.match(/https?:\/\/[^/]+/)?.[0] ?? 'http://unused'
  const result = classifyErrors(source, origin)
  assert.deepEqual(result.unexpectedErrors, [])
  assert.deepEqual(result.unexpectedPageErrors, [])
  if (source.source !== 'spec-baseline') continue
  assert.equal(result.classifiedPageErrors.length, 4)
  for (const mutate of [
    copy => { copy.source = 'candidate' },
    copy => { copy.pageErrors.push(clone(copy.pageErrors[0])) },
    copy => { copy.errors.push(copy.errors[0]) },
    copy => { copy.pageErrors.pop() },
    copy => { copy.errors.pop() },
    copy => { copy.pageErrors[0].phase = 'load' },
    copy => { copy.pageErrors[0].caseId = 'BLOCK_GALLERY_CAPTION_ORDER/rich-swap' },
    copy => { copy.pageErrors[0].message = 'Unrelated failure' },
    copy => { copy.errors[0] = copy.errors[0].replace('InlineProjectionRuntime.js:788:17', 'InlineProjectionRuntime.js:789:17') },
    copy => { copy.cases.find(entry => entry.mode === 'widgets').phases[0].blocks[1].data.images[0].caption += ' changed' },
    copy => { copy.cases.find(entry => entry.mode === 'widgets' && entry.action === 'remove').phases[2].active = { blockId: 'foreign', className: 'foreign-caption' } },
  ]) {
    const changed = clone(source); mutate(changed)
    const rejected = classifyErrors(changed, origin)
    assert(rejected.unexpectedErrors.length || rejected.unexpectedPageErrors.length)
    pageErrorNegative++
  }
}
assert.equal(positive, 224, 'Expected the complete six-case three-source witness')
console.log(JSON.stringify({ historicalObservationsAccepted: positive, negativeObservationControls: negative,
  pairedHistoricalPageErrorsAccepted: 4, negativePageErrorControls: pageErrorNegative, candidateExceptions: 0 }))
