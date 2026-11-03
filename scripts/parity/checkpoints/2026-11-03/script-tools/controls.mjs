import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
const [rawPath, candidate, output] = process.argv.slice(2)
assert.ok(rawPath && candidate && output)
const root = fileURLToPath(new URL('./', import.meta.url))
const bytes = readFileSync(rawPath), raw = JSON.parse(rawPath.endsWith('.gz') ? gunzipSync(bytes) : bytes)
const python = process.env.EDITOR_PYTHON_PATH
assert.ok(python)
mkdirSync(output, { recursive: true })
const review = (path, name) => {
  const args = [join(root, 'review.py'), '--raw', path, '--candidate', candidate,
    '--browser', join(root, 'integration-browser.log.gz'), '--output', join(output, name + '-review.json')]
  for (const mode of ['sup', 'sub', 'none', 'host']) args.push('--native-' + mode, join(root, 'integration-native-' + mode + '.log.gz'))
  const result = spawnSync(python, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 24 * 1024 * 1024 })
  assert.equal(result.error, undefined)
  return result
}
const healthy = review(rawPath, 'healthy')
assert.equal(healthy.status, 0, healthy.stderr)
const current = data => data.results.find(row => row.source === 'candidate')
const first = data => current(data).cases[0]
const observation = (data, phase, property) => {
  const value = first(data).observations.find(item => item.phase === phase && item.property === property)
  assert.ok(value); return value
}
const variants = [
  ['wrong-source', 'Replace the candidate production revision with the baseline.', data => {
    data.sources.find(source => source.label === 'candidate').sha = data.sources[1].sha
  }],
  ['consistent-wrong-mark', 'Remove intended sup in both operands while retaining PASS.', data => {
    const value = observation(data, 'apply', 'intendedTextAndMarks')
    assert.ok(value.actual.flat().some(token => token.marks.includes('sup')))
    for (const field of value.actual) for (const token of field) token.marks = token.marks.filter(mark => mark !== 'sup')
    value.expected = JSON.parse(JSON.stringify(value.actual))
  }],
  ['untrusted-panel-action', 'Call an untrusted panel activation expected in both operands.', data => {
    const value = observation(data, 'apply', 'trustedPanelAction'); value.actual = value.expected = false
  }],
  ['lost-panel-focus', 'Lose auxiliary panel focus while retaining trusted mouse action and PASS.', data => {
    const value = observation(data, 'apply', 'auxiliaryPanelFocus'); value.actual = value.expected = false
  }],
  ['wrong-undo', 'Append authored text to the recovered predecessor in both operands.', data => {
    const value = observation(data, 'undo-action', 'exactCanonicalDocument')
    value.actual[0].data.text += ' unwanted'
    value.expected = JSON.parse(JSON.stringify(value.actual))
  }],
  ['extra-history', 'Duplicate the Script commit while preserving visible and raw PASS claims.', data => {
    const events = first(data).transactions
    assert.equal(events[1].name, 'inline.script')
    events.splice(1, 0, JSON.parse(JSON.stringify(events[1])))
  }],
  ['lost-widget-owner', 'Mark a lost live widget expected in both operands.', data => {
    const value = observation(data, 'apply', 'liveWidgetIdentity'); value.actual = value.expected = false
  }],
  ['missing-normal', 'Remove all Normal cases while retaining other modes and candidatePass.', data => {
    const row = current(data), count = row.cases.length
    row.cases = row.cases.filter(item => item.spec.mode !== 'none')
    assert.equal(count - row.cases.length, 40)
  }],
  ['changed-application-host', 'Mutate the application boundary while calling it expected in both operands.', data => {
    const result = current(data).cases.find(item => item.spec.hostTag)
    assert.ok(result)
    const value = result.observations.find(item => item.property === 'applicationHostBoundary')
    value.actual.same = false
    value.expected = JSON.parse(JSON.stringify(value.actual))
  }],
]
const results = []
for (const [name, mutation, corrupt] of variants) {
  const data = JSON.parse(JSON.stringify(raw)); corrupt(data)
  const path = join(output, name + '.json'); writeFileSync(path, JSON.stringify(data))
  const result = review(path, name)
  assert.equal(result.status, 1, name + ' was not rejected')
  results.push({ name, mutation, exitCode: result.status, sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), stderr: result.stderr.slice(-2400) })
}
writeFileSync(join(output, 'results.json'), JSON.stringify({ healthyExitCode: healthy.status, results }, null, 2))
console.log(JSON.stringify({ healthyExitCode: healthy.status, rejected: results.map(item => item.name) }))
