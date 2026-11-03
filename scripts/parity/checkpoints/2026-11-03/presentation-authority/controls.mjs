import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
const [publicPath, nativePath, candidate, browserPath, nativeLog, output] = process.argv.slice(2)
assert.ok(publicPath && nativePath && candidate && browserPath && nativeLog && output)
const parse = path => JSON.parse(path.endsWith('.gz') ? gunzipSync(readFileSync(path)) : readFileSync(path))
const originals = { public: parse(publicPath), native: parse(nativePath) }
const python = process.env.EDITOR_PYTHON_PATH
assert.ok(python)
const reviewer = fileURLToPath(new URL('./review.py', import.meta.url))
mkdirSync(output, { recursive: true })
const review = (publicRaw, nativeRaw, name) => {
  const result = spawnSync(python, [reviewer, '--public-raw', publicRaw, '--native-raw', nativeRaw,
    '--candidate', candidate, '--browser', browserPath, '--native-log', nativeLog, '--output', join(output, name + '-review.json')],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.error, undefined)
  return result
}
const healthy = review(publicPath, nativePath, 'healthy')
assert.equal(healthy.status, 0, healthy.stderr)
const current = data => data.results.find(row => row.source === 'candidate')
const variants = [
  ['wrong-candidate', 'public', 'Replace the candidate production revision with the baseline.', data => {
    data.sources.find(source => source.label === 'candidate').sha = data.sources[1].sha
  }],
  ['discard-independent-b', 'public', 'Lose independent B in both operands while retaining PASS.', data => {
    const observation = current(data).traces[1].observations[0]
    observation.actual.b.known = observation.actual.b.opaque = false
    observation.expected = JSON.parse(JSON.stringify(observation.actual))
  }],
  ['manufactured-history', 'public', 'Create history for healthy presentation in both operands.', data => {
    const observation = current(data).traces[0].observations[0]
    observation.actual.history = [true, false, 1]
    observation.expected = JSON.parse(JSON.stringify(observation.actual))
  }],
  ['automatic-retry', 'public', 'Retry after settled queries while calling the new count expected.', data => {
    const observation = current(data).traces[1].observations[2]
    assert.equal(observation.actual, 0)
    observation.actual = observation.expected = 1
  }],
  ['untrusted-preedit', 'native', 'Relabel every native compositionstart as synthetic while keeping PASS.', data => {
    const events = current(data).nativeEvents.filter(event => event.kind === 'compositionstart')
    assert.ok(events.some(event => event.trusted))
    for (const event of events) event.trusted = false
  }],
  ['lost-native-text', 'native', 'Replace the completed genuine text with the predecessor in both operands.', data => {
    const observation = current(data).traces[0].observations[7]
    assert.equal(observation.actual[0].data.note, 'N日本ote {{note}} tail')
    observation.actual[0].data.note = 'Note {{note}} tail'
    observation.expected = JSON.parse(JSON.stringify(observation.actual))
  }],
  ['unfinished-cleanup', 'public', 'Leave a block scope live after public destruction in both operands.', data => {
    const observation = current(data).traces[0].observations.at(-1)
    assert.deepEqual(observation.actual, [true, true, true, true, true])
    observation.actual[2] = false
    observation.expected = [...observation.actual]
  }],
]
const results = []
for (const [name, group, mutation, corrupt] of variants) {
  const data = JSON.parse(JSON.stringify(originals[group]))
  corrupt(data)
  const path = join(output, name + '.json')
  writeFileSync(path, JSON.stringify(data))
  const result = review(group === 'public' ? path : publicPath, group === 'native' ? path : nativePath, name)
  assert.equal(result.status, 1, name + ' was not rejected')
  results.push({ name, group, mutation, exitCode: result.status,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), stderr: result.stderr.slice(-2400) })
}
writeFileSync(join(output, 'results.json'), JSON.stringify({ healthyExitCode: healthy.status, results }, null, 2))
console.log(JSON.stringify({ healthyExitCode: healthy.status, rejected: results.map(result => result.name) }))
