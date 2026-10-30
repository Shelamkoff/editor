import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'

const v1 = '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340'
const baseline = 'e981ff308000c1d92d7e820df95113c1e19bcee8'
const failure = (property, actual, expected) => ({ property, actual, expected, status: 'FAIL' })
const expectedFailures = {
  v1: [failure('timeout.latePreviewIgnored', true, false)],
  'spec-baseline': [failure('timeout.signal', false, true), failure('timeout.reason', null, 'TimeoutError'),
    failure('timeout.latePreviewIgnored', true, false)],
  candidate: [],
}
const properties = kind => ['load.authorData', 'load.history', 'resolver.liveRequests', 'resolver.arguments', 'load.signal',
  ...(kind === 'timeout' ? ['timeout.signal', 'timeout.reason', 'timeout.noPreview', 'timeout.latePreviewIgnored']
    : ['timely.preview', 'timely.alt', 'timely.noObsoleteTimeout']),
  'settled.authorData', 'settled.history', 'caller.unchanged', 'destroy.editorRemoved']

/** Verify one complete raw observation, without rewriting any historical result. */
export function verifyEmbedPreviewTimeout(report, { candidateSha, fixtureSha256 }) {
  assert.match(candidateSha, /^[a-f0-9]{40}$/)
  assert.equal(report.headBefore, candidateSha, 'Unexpected candidate source')
  assert.equal(report.headAfter, candidateSha, 'Source changed during comparison')
  assert.equal(report.fixtureSha256, fixtureSha256, 'Unexpected fixture source')
  assert.deepEqual(report.serverErrors, [], 'Comparison server errors are not historical differences')
  assert.deepEqual(report.sources.map(({ label, sha, legacy }) => ({ label, sha, legacy })), [
    { label: 'v1', sha: v1, legacy: true }, { label: 'spec-baseline', sha: baseline, legacy: false },
    { label: 'candidate', sha: candidateSha, legacy: false },
  ], 'Comparison must use the exact three immutable sources')
  for (const source of report.sources) {
    for (const module of ['core/index.js', 'plugins/embed/index.js']) {
      assert.match(source.loaded[module], /^[a-f0-9]{64}$/, `Missing loaded source ${source.label}/${module}`)
    }
  }
  const expectedCases = ['v1', 'spec-baseline', 'candidate'].flatMap(source => ['timeout', 'timely'].map(kind => `${source}/${kind}`))
  assert.deepEqual(report.results.map(entry => `${entry.source}/${entry.kind}`), expectedCases, 'Comparison scenarios are incomplete or duplicated')
  for (const entry of report.results) {
    assert.equal(entry.complete, true, `Incomplete ${entry.source}/${entry.kind}`)
    assert(!entry.error, `Fixture error: ${entry.error}`)
    assert.deepEqual(entry.errors, [], 'Page errors are not historical differences')
    assert.deepEqual(entry.observations.map(value => value.property), properties(entry.kind), 'Observation phases changed or are incomplete')
    for (const observation of entry.observations) {
      assert.equal(observation.status, isDeepStrictEqual(observation.actual, observation.expected) ? 'PASS' : 'FAIL',
        `Inconsistent observation verdict: ${observation.property}`)
    }
    const observedFailures = entry.observations.filter(value => value.status === 'FAIL')
    assert.deepEqual(entry.failures, observedFailures, 'Reported failures do not match raw observations')
    assert.deepEqual(observedFailures, entry.kind === 'timeout' ? expectedFailures[entry.source] : [],
      `Unexpected difference: ${entry.source}/${entry.kind}`)
  }
  assert.equal(report.candidatePass, true, 'Candidate must have zero failures')
  return { candidateSha, scenarios: 6, candidatePassed: 2, historicalDifferences: 4 }
}
