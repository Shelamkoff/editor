import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath, candidate, runDirectory, output] = process.argv.slice(2)
assert.ok(rawPath && candidate && runDirectory && output && process.env.EDITOR_PYTHON_PATH)
const root = fileURLToPath(new URL('./', import.meta.url))
const reviewSource = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()
const raw = JSON.parse(readFileSync(rawPath))
mkdirSync(output, { recursive: true })
const review = (path, name) => {
  const args = [join(root, 'review.py'), '--raw', path, '--candidate', candidate,
    '--review-source', reviewSource,
    '--browser', join(runDirectory, 'browser-all.log'), '--output', join(output, name + '-review.json')]
  for (const value of ['left', 'center', 'right', 'justify']) args.push('--native-' + value, join(runDirectory, 'native-' + value + '.log'))
  const result = spawnSync(process.env.EDITOR_PYTHON_PATH, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  assert.equal(result.error, undefined); return result
}
const healthy = review(rawPath, 'healthy'); assert.equal(healthy.status, 0, healthy.stderr)
const cases = data => data.results.find(row => row.source === 'candidate').cases
const observation = (data, phase, property, predicate = () => true) => {
  const value = cases(data).find(predicate)?.observations.find(o => o.phase === phase && o.property === property)
  assert.ok(value); return value
}
const both = (item, fn) => { fn(item.actual); item.expected = structuredClone(item.actual) }
const variants = [
  ['wrong-source', data => { data.sources[2].sha = data.sources[1].sha }],
  ['wrong-alignment', data => both(observation(data, 'apply', 'canonical'), value => { value[0].tunes = { textAlign: 'justify' } })],
  ['changed-author-text', data => both(observation(data, 'apply', 'canonical'), value => { value[0].data.text += ' unwanted' })],
  ['lost-selection', data => both(observation(data, 'apply', 'selection'), value => { value.anchor.offset += 1 })],
  ['wrong-undo', data => both(observation(data, 'undo-action', 'canonical'), value => { value[0].tunes = { textAlign: 'right' } })],
  ['extra-history', data => { cases(data)[0].transactions.splice(1, 0, structuredClone(cases(data)[0].transactions[1])) }],
  ['untrusted-mode', data => { const o = observation(data, 'apply', 'trustedMode'); o.actual = o.expected = false }],
  ['retired-port-authority', data => both(observation(data, 'inactive', 'staleScalarPort', c => Boolean(c.spec.lifetime)), value => { value[0].result = true })],
  ['missing-justify', data => { data.results[2].cases = cases(data).filter(c => c.spec.value !== 'justify') }],
]
const results = []
for (const [name, mutate] of variants) {
  const data = structuredClone(raw); mutate(data)
  const path = join(output, name + '.json'); writeFileSync(path, JSON.stringify(data))
  const result = review(path, name); assert.equal(result.status, 1, name + ' was accepted')
  results.push({ name, exitCode: result.status, sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), stderr: result.stderr.slice(-1800) })
}
writeFileSync(join(output, 'results.json'), JSON.stringify({ healthyExitCode: healthy.status, results }, null, 2))
console.log(JSON.stringify({ healthyExitCode: healthy.status, rejected: results.map(value => value.name) }))
