import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'

const root = process.argv[2] ?? '/tmp/rector-person-final-roundtrip-20261029'
const rawPath = process.argv[3] ?? '/tmp/rector-person-normalized-raw.json'
const output = process.argv[4] ?? '/tmp/rector-person-classification-check.json'
const runner = readFileSync(root + '/scripts/parity/block-roundtrip.mjs', 'utf8')
const rawBytes = readFileSync(rawPath)
const raw = JSON.parse(rawBytes)
const start = runner.indexOf('// Exact captured Person reference differences.')
const end = runner.indexOf('\nconst repo = ', start)
assert(start >= 0 && end > start, 'Exact classifier section exists')
const section = runner.slice(start, end)
const classify = vm.runInNewContext(section + '\nclassifyPersonDifference')
const digest = value => createHash('sha256').update(value).digest('hex')
const clone = value => structuredClone(value)
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
freeze(raw)
const families = [
  ['candidate source', item => { item.source = 'candidate' }],
  ['unknown source', item => { item.source = 'future-baseline' }],
  ['similar future case', item => { item.entry.id += '-future' }],
  ['unknown phase', item => { item.failure.phase = 'unobserved' }],
  ['wrong status', item => { item.failure.status = 'PASS' }],
  ['unobserved property', item => { item.failure.property = 'unobserved' }],
  ['changed actual value', item => { item.failure.actual = { unobserved: true } }],
  ['changed expected value', item => { item.failure.expected = { unobserved: true } }],
  ['missing completed phase', item => { item.entry.completedPhases.pop() }],
  ['changed canonical record', item => { item.entry.phases[0].blocks[0].type = 'unobserved' }],
  ['missing phase snapshot', item => { item.entry.phases.pop() }],
  ['changed history actual', item => { item.entry.observations.find(x => x.property === 'historyState').actual.canUndo = true }],
  ['changed history expected', item => { item.entry.observations.find(x => x.property === 'historyState').expected.canRedo = true }],
  ['duplicate history observation', item => { item.entry.observations.push(clone(item.entry.observations.find(x => x.property === 'historyState'))) }],
]
const bySource = {}, negatives = Object.fromEntries(families.map(([name]) => [name, 0]))
let positives = 0, ownerNegatives = 0
for (const result of raw.results) {
  const counts = {}, sources = { repaired: 0, unsupported: 0 }
  bySource[result.source] = { rawFailures: 0, categories: sources, classifications: counts }
  for (const entry of result.cases) {
    for (const failure of entry.failures) {
      const name = classify(result.source, entry, failure)
      assert(name, `${result.source} ${entry.id} ${failure.phase} ${failure.property}`)
      assert.equal(result.source === 'candidate', false)
      counts[name] = (counts[name] ?? 0) + 1
      sources[name.startsWith('unsupported-') ? 'unsupported' : 'repaired']++
      bySource[result.source].rawFailures++
      positives++
      for (const [family, mutate] of families) {
        const changed = { source: result.source, entry: clone(entry), failure: clone(failure) }
        mutate(changed)
        const before = JSON.stringify(changed)
        freeze(changed)
        assert.equal(classify(changed.source, changed.entry, changed.failure), null,
          `${family}: ${result.source} ${entry.id} ${failure.phase} ${failure.property}`)
        assert.equal(JSON.stringify(changed), before, 'Classifier mutated its inputs')
        negatives[family]++
      }
      if (['nativeSelection', 'fixtureCaret'].includes(failure.property)) {
        const changed = clone(entry)
        changed.phases.find(item => item.phase === failure.phase).selectionOwner.anchor.offset++
        assert.equal(classify(result.source, freeze(changed), failure), null, 'Changed native owner accepted')
        ownerNegatives++
      }
    }
  }
}
assert.equal(positives, 175)
assert.deepEqual(bySource.v1.categories, { repaired: 61, unsupported: 90 })
assert.deepEqual(bySource['spec-baseline'].categories, { repaired: 24, unsupported: 0 })
assert.equal(bySource.candidate.rawFailures, 0)
assert.equal(ownerNegatives, 12)
const report = {
  status: 'PASS', root, rawPath,
  runnerSha256: digest(runner), classifierSha256: digest(section), rawSha256: digest(rawBytes),
  positives, negativeFamilies: negatives, negativeCount: Object.values(negatives).reduce((a, b) => a + b, 0),
  changedNativeOwnerNegativeCount: ownerNegatives, bySource,
  note: 'Offline classifier sensitivity only. Raw failures and incomplete phases are unchanged; no browser gate is credited.',
}
writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
