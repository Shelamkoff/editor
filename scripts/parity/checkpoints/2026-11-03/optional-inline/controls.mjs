import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const [publicPath, nativePath, candidate, browserPath, nativeLog, output] = process.argv.slice(2)
assert.ok(publicPath && nativePath && candidate && browserPath && nativeLog && output)
const read = path => { const bytes = readFileSync(path); return JSON.parse(path.endsWith('.gz') ? gunzipSync(bytes) : bytes) }
const corpora = { public: read(publicPath), native: read(nativePath) }
const python = process.env.EDITOR_PYTHON_PATH ?? 'python3'
const reviewer = fileURLToPath(new URL('./review.py', import.meta.url))
mkdirSync(output, { recursive: true })
const review = (publicInput, nativeInput, name) => {
  const result = spawnSync(python, [reviewer, '--public-raw', publicInput, '--native-raw', nativeInput,
    '--candidate', candidate, '--browser', browserPath, '--native-log', nativeLog, '--output', join(output, name + '-review.json')],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.error, undefined)
  return result
}
const healthy = review(publicPath, nativePath, 'healthy')
assert.equal(healthy.status, 0, healthy.stderr)
const current = data => data.results.find(row => row.source === 'candidate')
const variants = [
  ['wrong-candidate', 'public', 'Replace the candidate source with the specification baseline.', data => {
    data.sources.find(source => source.label === 'candidate').sha = data.sources[1].sha
  }],
  ['consistent-stale-label', 'public', 'Keep Original as both actual and expected after an allegedly accepted Updated payload.', data => {
    const observation = current(data).traces[0].observations[1]
    assert.equal(observation.actual, 'Updated'); observation.actual = observation.expected = 'Original'
  }],
  ['double-then-getter', 'public', 'Change both actual and expected then-getter count to two.', data => {
    const trace = current(data).traces.find(value => value.name === 'existing update thenable rejects synchronously without fallback or unhandled rejection')
    const observation = trace.observations[1]
    assert.deepEqual(observation.actual, [1, 1, true]); observation.actual[0] = 2; observation.expected = structuredClone(observation.actual)
  }],
  ['untrusted-native-event', 'native', 'Revoke trusted native input in both the observation and independent result record.', data => {
    const row = current(data), observation = row.traces[0].observations[0]
    assert.equal(observation.actual[0].trusted, true)
    observation.actual[0].trusted = false; observation.expected = structuredClone(observation.actual)
    row.nativeCases[0].beforeInput[0].trusted = false
  }],
  ['stolen-successor-caret', 'native', 'Replace both actual and expected newer field selection with an old queued widget caret.', data => {
    const trace = current(data).traces.find(value => value.name === 'trusted immediate same-id-owner supersedes the old queued caret')
    const observation = trace.observations[3]
    assert.equal(observation.actual.anchorOffset, 1)
    observation.actual = observation.expected = { anchor: false, focus: false, anchorOffset: 2, focusOffset: 2, active: false }
  }],
  ['missing-rollback-race', 'native', 'Delete the rollback race, trace, record and protocol entries while leaving other PASS verdicts.', data => {
    const row = current(data), name = 'trusted immediate rollback supersedes the old queued caret'
    assert.equal(row.cases.filter(value => value.name === name).length, 1)
    for (const key of ['cases', 'traces', 'nativeCases', 'nativeInputs']) row[key] = row[key].filter(value => value.name !== name)
  }],
]
const results = []
for (const [name, group, mutation, corrupt] of variants) {
  const data = structuredClone(corpora[group]); corrupt(data)
  const path = join(output, name + '.json'); writeFileSync(path, JSON.stringify(data))
  const result = review(group === 'public' ? path : publicPath, group === 'native' ? path : nativePath, name)
  assert.equal(result.status, 1, name + ' was not rejected')
  results.push({ name, group, mutation, exitCode: result.status,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), stderr: result.stderr.slice(-2400) })
}
writeFileSync(join(output, 'results.json'), JSON.stringify({ healthyExitCode: healthy.status, results }, null, 2))
console.log(JSON.stringify({ healthyExitCode: healthy.status, rejected: results.map(value => value.name) }))
