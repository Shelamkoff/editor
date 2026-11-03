import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const [rawPath, candidate, browserPath, output] = process.argv.slice(2)
assert.ok(rawPath && candidate && browserPath && output, 'Provide raw corpus, candidate, browser log and output directory')
const bytes = readFileSync(rawPath)
const raw = JSON.parse(rawPath.endsWith('.gz') ? gunzipSync(bytes) : bytes)
const python = process.env.EDITOR_PYTHON_PATH ?? 'python3'
const reviewer = fileURLToPath(new URL('./review.py', import.meta.url))
mkdirSync(output, { recursive: true })
const review = (path, name) => {
  const result = spawnSync(python, [reviewer, '--raw', path, '--candidate', candidate,
    '--browser', browserPath, '--output', join(output, name + '-review.json')],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.error, undefined)
  return result
}
const healthy = review(rawPath, 'healthy')
assert.equal(healthy.status, 0, healthy.stderr)
const current = data => data.results.find(row => row.source === 'candidate')
const variants = [
  ['wrong-candidate', 'Replace the candidate source with the specification baseline.', data => {
    data.sources.find(source => source.label === 'candidate').sha = data.sources[1].sha
  }],
  ['consistent-wrong-undo', 'Retain the completed URL in actual and expected after a supposedly grouped Undo.', data => {
    const trace = current(data).traces[0], observation = trace.observations[5]
    assert.equal(trace.name, 'block completion history eligible preserves data and qualified grouping')
    assert.equal(observation.actual[0].data.url, 'https://before.example')
    observation.actual[0].data.url = 'https://after.example'
    observation.expected = structuredClone(observation.actual)
  }],
  ['nested-publication-producer', 'Claim a synchronous nested producer ran, changing actual and expected counts together.', data => {
    const trace = current(data).traces.find(value => value.name === 'publication continuation live admits only later live host commands')
    assert.ok(trace)
    const observation = trace.observations[0]
    assert.deepEqual(observation.actual, [0, 0, 1])
    observation.actual = observation.expected = [1, 0, 0]
  }],
  ['early-diagnostic-delivery', 'Deliver the queued diagnostic command during metadata collection in both actual and expected.', data => {
    const trace = current(data).traces.find(value => value.name === 'diagnostic continuation live guards metadata and admits only later live host commands')
    assert.ok(trace)
    const observation = trace.observations[1]
    assert.deepEqual(observation.actual, [2, 0, 0, 0])
    observation.actual = observation.expected = [2, 0, 1, 1]
  }],
  ['missing-destroyed-continuation', 'Delete the destroyed-editor continuation and its trace, leaving other PASS verdicts.', data => {
    const row = current(data), name = 'publication continuation destroyed admits only later live host commands'
    assert.equal(row.cases.filter(value => value.name === name).length, 1)
    row.cases = row.cases.filter(value => value.name !== name)
    row.traces = row.traces.filter(value => value.name !== name)
  }],
]
const results = []
for (const [name, mutation, corrupt] of variants) {
  const data = structuredClone(raw)
  corrupt(data)
  const path = join(output, name + '.json')
  writeFileSync(path, JSON.stringify(data))
  const result = review(path, name)
  assert.equal(result.status, 1, name + ' was not rejected')
  results.push({ name, mutation, exitCode: result.status,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), stderr: result.stderr.slice(-2400) })
}
writeFileSync(join(output, 'results.json'), JSON.stringify({ healthyExitCode: healthy.status, results }, null, 2))
console.log(JSON.stringify({ healthyExitCode: healthy.status, rejected: results.map(result => result.name) }))
