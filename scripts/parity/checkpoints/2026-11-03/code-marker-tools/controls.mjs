import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const [rawPath, candidate, nativePath, output] = process.argv.slice(2)
assert.ok(rawPath && candidate && nativePath && output, 'Provide raw corpus, candidate, native log and output directory')
const bytes = readFileSync(rawPath)
const raw = JSON.parse(rawPath.endsWith('.gz') ? gunzipSync(bytes) : bytes)
const python = process.env.EDITOR_PYTHON_PATH ?? 'python3'
const reviewer = fileURLToPath(new URL('./review.py', import.meta.url))
mkdirSync(output, { recursive: true })
const review = (path, name) => {
  const result = spawnSync(python, [reviewer, '--raw', path, '--candidate', candidate,
    '--native', nativePath, '--output', join(output, name + '-review.json')],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.error, undefined)
  return result
}
const healthy = review(rawPath, 'healthy')
assert.equal(healthy.status, 0, healthy.stderr)
const variants = [
  ['wrong-candidate', 'Replace the candidate production source with the specification baseline.', data => {
    data.sources.find(source => source.label === 'candidate').sha = data.sources[1].sha
  }],
  ['consistent-wrong-oracle', 'Change both actual and expected text while keeping its PASS verdict.', data => {
    const observation = data.results.find(row => row.source === 'candidate').cases[0].observations
      .find(value => value.property === 'intendedTextAndMarks')
    observation.actual[0][0].text = 'Corrupted'
    observation.expected = structuredClone(observation.actual)
    observation.status = 'PASS'
  }],
  ['missing-trusted-input', 'Retain content verdicts but revoke the recorded native input.', data => {
    data.results.find(row => row.source === 'candidate').cases[0].trusted[0].trusted = false
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
