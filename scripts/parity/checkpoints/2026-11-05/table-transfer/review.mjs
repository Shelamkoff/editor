import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { hash, verifyIdentity, verifyObservations } from './history-merge-identity.mjs'
import { model, specs, verifyRawReplay } from './model.mjs'

const [input, candidate, output] = process.argv.slice(2)
const raw = readFileSync(input)
const data = JSON.parse(raw)
const parent = '8fbc721a2331a9a1d763b069b1cbb028737dce81'
const identity = verifyIdentity(data, candidate, 'table-transfer', parent)
const changedRuntimeFiles = execFileSync('git', [
  'diff', '--name-only', parent, candidate, '--', 'core', 'plugins', 'shared', 'renderer',
  'plugin-kit', 'inline-tools', 'inline-plugins', 'preset', 'locale', 'index.js', 'package.json', 'package-lock.json',
], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(path => !path.endsWith('.test.js'))
assert.deepEqual(changedRuntimeFiles, ['plugins/shared/textSelectionSlice.js', 'plugins/table/index.js'])
for (const source of data.sources) assert(source.loaded['plugins/table/index.js'])

const results = []
for (const row of data.results) {
  assert.deepEqual(row.cases.map(item => item.spec), specs)
  const differences = []
  let unavailableLegacyBodies = 0
  for (const item of row.cases) {
    const unavailable = row.source === 'v1' && item.spec.kind === 'widget'
    const unsupported = row.source === 'v1' ? ['currentObservers'] : []
    if (unavailable) {
      unsupported.push('selectionConversionUI')
      assert.equal(item.available, false)
      assert.equal(item.rawAfter, null)
      assert.deepEqual(item.planned, ['load', 'select', 'availability', 'dispose'])
      unavailableLegacyBodies++
    }
    assert.deepEqual(item.unsupported.map(entry => entry.property), unsupported)
    for (const observation of item.observations) {
      if (observation.status === 'FAIL') differences.push([item.id, observation.phase, observation.property])
    }
    if (row.source === 'candidate') {
      const expected = model(item.spec)
      verifyObservations(verifyRawReplay(item, expected), expected)
      if (item.spec.kind === 'paste') assert.deepEqual(item.clipboard, { trusted: true, tableHTML: true, private: false })
      else assert.equal(item.available, true)
    }
  }
  assert.equal(differences.length, { v1: 80, 'spec-baseline': 16, parent: 16, candidate: 0 }[row.source])
  const observations = row.cases.reduce((count, item) => count + item.observations.length, 0)
  if (row.source === 'candidate') assert.equal(observations, 372)
  results.push({ source: row.source, trustedPolicy: row.trustedPolicy, scenarioExecutions: row.cases.length, observations, differences, unavailableLegacyBodies })
}
const report = {
  status: 'PASS', candidate, parent, group: 'table-transfer', productionChanged: true, changedRuntimeFiles,
  currentCases: 48, currentObservations: 744, ...identity,
  rawSha256: hash(raw), reviewerSha256: hash(readFileSync(import.meta.filename)),
  modelSha256: hash(readFileSync(new URL('./model.mjs', import.meta.url))), results,
  scope: 'Trusted external table HTML paste preserves the selected paragraph. Exact replay and rich selection conversion preserve the intended Table residual, including blank neighbors, and move the whole-table range without an empty source table.',
}
writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, results: results.map(row => ({ ...row, differences: row.differences.length })) }))
