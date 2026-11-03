import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const [rawPath, candidate, browserPath, output] = process.argv.slice(2)
assert.ok(rawPath && candidate && browserPath && output,
  'Provide raw corpus, candidate, plain browser log and output directory')
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
  ['wrong-candidate', 'Replace the candidate production source with the specification baseline.', data => {
    data.sources.find(source => source.label === 'candidate').sha = data.sources[1].sha
  }],
  ['consistent-wrong-state', 'Change actual and expected canonical data together while retaining PASS.', data => {
    const observation = current(data).traces[0].observations.find(value =>
      value.kind === 'equal' && Array.isArray(value.actual) && value.actual[0]?.type === 'scope-block')
    assert.ok(observation)
    observation.actual[0].data.count = 42
    observation.expected = structuredClone(observation.actual)
  }],
  ['missing-option-read', 'Remove the option getter call from both actual and expected counts.', data => {
    const observation = current(data).traces[0].observations.find(value =>
      value.kind === 'equal' && JSON.stringify(value.actual) === '[1,0,1]')
    assert.ok(observation)
    observation.actual[0] = 0
    observation.expected = structuredClone(observation.actual)
  }],
  ['missing-retired-mode-case', 'Remove the mode-revoked task case and its trace, retaining other PASS verdicts.', data => {
    const row = current(data)
    const name = 'retired task mode-revoked reads no options or producer and leaves its owner usable'
    assert.equal(row.cases.filter(value => value.name === name).length, 1)
    assert.equal(row.traces.filter(value => value.name === name).length, 1)
    row.cases = row.cases.filter(value => value.name !== name)
    row.traces = row.traces.filter(value => value.name !== name)
  }],
  ['exposed-decoded-accessor', 'Expose an unevaluated decoder accessor as both actual and expected read data.', data => {
    const trace = current(data).traces.find(value =>
      value.name === 'inline onDecode returns data but cannot write or destroy its owning editor')
    assert.ok(trace)
    const observation = trace.observations.find(value => value.kind === 'equal' && value.actual?.label === 'Accepted')
    assert.ok(observation)
    observation.actual.label = { $accessor: true }
    observation.expected = structuredClone(observation.actual)
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
