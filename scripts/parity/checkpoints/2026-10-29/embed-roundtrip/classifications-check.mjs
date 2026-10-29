import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const runnerPath = '/tmp/rector-embed-final-roundtrip-20261029/scripts/parity/block-roundtrip.mjs'
const runner = await readFile(runnerPath, 'utf8')
const start = runner.indexOf('// These fixed values recognize only captured historical Embed failures.')
const end = runner.indexOf("const repo = fileURLToPath(", start)
assert(start >= 0 && end > start)
const classify = new Function(runner.slice(start, end) + '\nreturn classifyEmbedDifference')()
const rawPath = '/tmp/rector-embed-roundtrip-corrected-raw.json'
const raw = JSON.parse(await readFile(rawPath, 'utf8'))
const result = { runnerSha256: createHash('sha256').update(runner).digest('hex'), rawPath, sources: [], rejects: {} }
const mutate = value => {
  if (typeof value === 'string') return value + '!'
  if (typeof value === 'number') return value + 1
  if (typeof value === 'boolean') return !value
  if (value === null || value === undefined) return '__unexpected__'
  const copy = structuredClone(value)
  const key = Object.keys(copy)[0]
  if (key !== undefined) copy[key] = mutate(copy[key])
  else if (Array.isArray(copy)) copy.push('__unexpected__')
  else copy.__unexpected__ = true
  return copy
}
const controls = {
  candidate: (source, entry, failure) => classify('candidate', entry, failure),
  source: (source, entry, failure) => classify('unknown-source', entry, failure),
  caseId: (source, entry, failure) => classify(source, { ...entry, id: entry.id + '-new' }, failure),
  phase: (source, entry, failure) => classify(source, entry, { ...failure, phase: 'unobserved' }),
  property: (source, entry, failure) => classify(source, entry, { ...failure, property: 'unobserved' }),
  prototypeProperty: (source, entry, failure) => classify(source, entry, { ...failure, property: 'constructor', actual: undefined, expected: undefined }),
  actual: (source, entry, failure) => classify(source, entry, { ...failure, actual: mutate(failure.actual) }),
  expected: (source, entry, failure) => classify(source, entry, { ...failure, expected: mutate(failure.expected) }),
}
for (const source of raw.results) {
 const counts = {}
 for (const entry of source.cases) for (const failure of entry.failures) {
   const accepted = classify(source.source, entry, failure)
   assert(accepted, JSON.stringify({ source: source.source, id: entry.id, failure }))
   counts[accepted] = (counts[accepted] ?? 0) + 1
   for (const [name, control] of Object.entries(controls)) {
     assert.equal(control(source.source, entry, failure), null, JSON.stringify({ name, source: source.source, id: entry.id, failure }))
     result.rejects[name] = (result.rejects[name] ?? 0) + 1
   }
 }
 result.sources.push({ source: source.source, failures: source.cases.reduce((sum, entry) => sum + entry.failures.length, 0), counts })
}
await writeFile('/tmp/rector-embed-classification-check.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
