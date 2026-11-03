import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const [rawPath, candidate, nativePath, output] = process.argv.slice(2)
assert.ok(rawPath && candidate && nativePath && output && process.env.EDITOR_PYTHON_PATH)
const root = fileURLToPath(new URL('./', import.meta.url)), raw = JSON.parse(readFileSync(rawPath))
mkdirSync(output, { recursive: true })
const review = (path, name) => {
  const result = spawnSync(process.env.EDITOR_PYTHON_PATH, [join(root, 'review.py'), '--raw', path, '--candidate', candidate, '--native', nativePath, '--output', join(output, name + '-review.json')], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  assert.equal(result.error, undefined); return result
}
const healthy = review(rawPath, 'healthy'); assert.equal(healthy.status, 0, healthy.stderr)
const cases = data => data.results[2].cases
const observe = (data, phase, property, variant = 'apply') => {
  const item = cases(data).find(c => c.spec.variant === variant).observations.find(o => o.phase === phase && o.property === property)
  assert.ok(item); return item
}
const both = (item, change) => { change(item.actual); item.expected = structuredClone(item.actual) }
const variants = [
  ['wrong-source', data => { data.sources[2].sha = data.sources[1].sha }],
  ['missing-bold', data => both(observe(data, 'apply', 'canonical'), value => { value[0].data.text = '<i>alpha</i> rest' })],
  ['wrong-range', data => both(observe(data, 'apply', 'selection'), value => { value.focus = 4; value.text = 'alph' })],
  ['wrong-undo', data => both(observe(data, 'undo', 'canonical'), value => { value[0].data.text += ' changed' })],
  ['extra-history', data => { cases(data)[0].transactions.splice(1, 0, structuredClone(cases(data)[0].transactions[0])) }],
  ['untrusted-bold', data => { const o = observe(data, 'apply', 'trustedBold'); o.actual = o.expected = false }],
  ['foreign-owner-change', data => both(observe(data, 'apply', 'foreignOwnerUnchanged', 'foreign'), value => { value[0].data.text = '<b>alpha</b>' })],
  ['missing-element-ranges', data => { data.results[2].cases = cases(data).filter(c => c.spec.boundary === 'Text') }],
]
const results = []
for (const [name, mutate] of variants) {
  const data = structuredClone(raw); mutate(data); const path = join(output, name + '.json'); writeFileSync(path, JSON.stringify(data))
  const result = review(path, name); assert.equal(result.status, 1, name + ' was accepted')
  results.push({ name, exitCode: result.status, sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), stderr: result.stderr.slice(-1500) })
}
writeFileSync(join(output, 'results.json'), JSON.stringify({ healthyExitCode: healthy.status, results }, null, 2))
console.log(JSON.stringify({ healthyExitCode: healthy.status, rejected: results.map(r => r.name) }))
