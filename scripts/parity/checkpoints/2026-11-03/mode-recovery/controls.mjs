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
  ['wrong-candidate', 'Replace candidate production source with the specification baseline.', data => {
    data.sources.find(source => source.label === 'candidate').sha = data.sources[1].sha
  }],
  ['consistent-split-mode', 'Change actual and expected native controls together to a split mode while retaining PASS.', data => {
    const trace = current(data).traces.find(value => value.name === 'block mode false: rollback throw null restores committed controls')
    assert.ok(trace)
    const observation = trace.observations[2]
    assert.deepEqual(observation.actual, [false, false])
    observation.actual = [true, false]; observation.expected = [true, false]
  }],
  ['lost-recovery-payload', 'Remove one ordered recovery failure from actual and expected while retaining PASS.', data => {
    const trace = current(data).traces.find(value => value.name === 'block secondary restore throw undefined preserves accepted model and permits public disposal')
    assert.ok(trace)
    const observation = trace.observations[1]
    assert.equal(observation.actual.length, 4)
    observation.actual.splice(2, 1); observation.expected = structuredClone(observation.actual)
  }],
  ['missing-successful-control', 'Remove the ordinary inline mode control and trace without changing the remaining verdicts.', data => {
    const row = current(data), name = 'inline successful mode round trip preserves instances and history while retiring old tasks'
    assert.equal(row.cases.filter(value => value.name === name).length, 1)
    row.cases = row.cases.filter(value => value.name !== name)
    row.traces = row.traces.filter(value => value.name !== name)
  }],
  ['revived-old-task', 'Change both actual and expected retired-task admission to true.', data => {
    const trace = current(data).traces.find(value => value.name === 'block successful mode round trip preserves instances and history while retiring old tasks')
    assert.ok(trace)
    const observation = trace.observations[11]
    assert.equal(observation.actual, false)
    observation.actual = observation.expected = true
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
