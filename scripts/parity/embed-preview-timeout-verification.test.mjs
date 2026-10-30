import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { verifyEmbedPreviewTimeout } from './embed-preview-timeout-verification.mjs'

// Actual captured browser observations, including both historical failures.
const captured = JSON.parse(gunzipSync(readFileSync(new URL('./checkpoints/2026-10-30/embed-preview-parity/run-8gKL1g/preview-parity-final.log.gz', import.meta.url))))
const source = { candidateSha: '68e2b880afe50a4dab2ec85c538ab0b078251730', fixtureSha256: captured.fixtureSha256 }

test('Embed preview verification accepts the complete captured three-source observation', () => {
  assert.deepEqual(verifyEmbedPreviewTimeout(captured, source), {
    candidateSha: source.candidateSha, scenarios: 6, candidatePassed: 2, historicalDifferences: 4,
  })
})

function addFailure(report, source, property) {
  const entry = report.results.find(value => value.source === source && value.kind === 'timely')
  const observation = entry.observations.find(value => value.property === property)
  observation.actual = [true, false]
  observation.status = 'FAIL'
  entry.failures.push(observation)
}

for (const [name, mutate] of [
  ['a candidate failure', report => addFailure(report, 'candidate', 'settled.history')],
  ['an unexpected historical failure', report => addFailure(report, 'v1', 'settled.history')],
  ['a missing scenario', report => report.results.pop()],
  ['an unknown reference source', report => { report.sources[0].sha = '0'.repeat(40) }],
  ['an incomplete observation phase', report => { report.results[0].observations.pop() }],
  ['a page error', report => { report.results[0].errors.push('Unexpected page error') }],
  ['a false passing verdict', report => { report.results[0].observations[0].actual = {} }],
]) test(`Embed preview verification rejects ${name}`, () => {
  const changed = structuredClone(captured)
  mutate(changed)
  assert.throws(() => verifyEmbedPreviewTimeout(changed, source))
})
