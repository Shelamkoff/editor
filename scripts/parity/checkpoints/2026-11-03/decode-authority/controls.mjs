import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const [rawPath, candidate, browserPath, output] = process.argv.slice(2)
assert.ok(rawPath && candidate && browserPath && output)
const bytes = readFileSync(rawPath)
const raw = JSON.parse(rawPath.endsWith('.gz') ? gunzipSync(bytes) : bytes)
const python = process.env.EDITOR_PYTHON_PATH
assert.ok(python)
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
  ['accepted-literal-fallback', 'Change recovered accepted data while retaining PASS and stable-data claims.', data => {
    current(data).ownerObservations[2].finalSaved[0].data.text = '{{a-fault}} accepted literal fallback'
  }],
  ['missing-undefined-cause', 'Remove own undefined cause while changing both assertion operands and the cause record.', data => {
    const row = current(data), name = 'projection decoder throw undefined with 1 failures preserves its cause and recovery owner'
    const observation = row.traces.find(trace => trace.name === name).observations[0]
    assert.deepEqual(observation.actual, [1, ['invalid-data'], [true], false])
    observation.actual[2][0] = false
    observation.expected = JSON.parse(JSON.stringify(observation.actual))
    row.extraObservations.find(item => item.name === name).exactCauses[0] = false
  }],
  ['consistent-proto-loss', 'Strip every own __proto__ key from current observations, including both assertion operands.', data => {
    let removed = 0
    const strip = value => {
      if (!value || typeof value !== 'object') return
      if (Object.hasOwn(value, '__proto__')) { delete value.__proto__; removed++ }
      for (const child of Object.values(value)) strip(child)
    }
    strip(current(data))
    assert.ok(removed > 0)
  }],
  ['unfinished-cleanup', 'Retain all PASS verdicts but leave a staged widget owner alive after public destruction.', data => {
    current(data).ownerObservations[0].cleanup.widgetsRetired = false
  }],
  ['relabel-legacy-loss', 'Call actual v1 data loss a passing preservation control without restoring its saved data.', data => {
    const row = data.results.find(item => item.source === 'v1').legacyUnknownCases[0]
    assert.equal(row.status, 'FAIL')
    row.status = 'PASS'; row.dataPreserved = true
  }],
  ['missing-mode-disable', 'Remove the read-only reversal case, trace and owner record while retaining remaining PASS verdicts.', data => {
    const row = current(data), name = 'mode disable decoder failure restores coherent read-only projection'
    assert.equal(row.cases.filter(item => item.name === name).length, 1)
    for (const key of ['cases', 'traces', 'ownerObservations']) row[key] = row[key].filter(item => item.name !== name)
  }],
]
const results = []
for (const [name, mutation, corrupt] of variants) {
  // JSON text preserves own __proto__ keys across the test transport as well.
  const data = JSON.parse(JSON.stringify(raw))
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
