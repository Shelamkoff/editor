import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const [rawPath, candidate] = process.argv.slice(2)
assert(rawPath && candidate, 'Usage: node review.mjs raw.json exact-candidate-ref')
const root = process.cwd(), dependencies = resolve(root, 'node_modules')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })
const sha = ref => git('rev-parse', ref).toString().trim()
const digest = value => createHash('sha256').update(value).digest('hex')
const raw = JSON.parse(await readFile(rawPath, 'utf8'))
assert.deepEqual(raw.sources.map(source => [source.label, source.sha]), [
  ['v1', sha('5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340')],
  ['spec-baseline', sha('e981ff308000c1d92d7e820df95113c1e19bcee8')],
  ['parent', sha('69c8425e0081fde69cf5176ccb73d032720c15fc')],
  ['candidate', sha(candidate)],
])
assert.deepEqual(raw.serverErrors, [])
assert.equal(raw.candidatePass, true)
const ids = ['renderBlock', 'render', 'renderTo'].flatMap(method => ['data', 'revision'].flatMap(signature =>
  ['placeholder', 'throw'].map(mode => `registration/${method}/${signature}/${mode}`)))
const common = ['registerReturnsOwner', 'initialRegistry', 'initialOutput', 'replacementKeepsOldOutput',
  'replacementDoesNotDispose', 'newRegistryOwnsNewOutput', 'unregisterReturnsOwner', 'unregisteredTypes',
  'unregisteredHasRenderer', 'retainedOldOutputAfterUnregister', 'retainedOldContentAfterUnregister',
  'unknownBehavior', 'reregisteredTypes', 'reregisteredOutput', 'retainedUsesOriginalDisposer',
  'retainedDisposalKeepsNewOutput', 'callerInput', 'exactOriginatingDisposers', 'createdCount']
let registrationObservations = 0, allObservations = 0, modules = 0, dependencyFiles = 0
for (const source of raw.sources) {
  assert.equal(source.tree, sha(`${source.sha}^{tree}`))
  for (const [path, expected] of Object.entries(source.loaded)) {
    assert.equal(digest(git('show', `${source.sha}:${path}`)), expected, `Source bytes changed: ${source.label}/${path}`)
    modules++
  }
  const result = raw.results.find(entry => entry.source === source.label)
  assert(result)
  assert.deepEqual(result.pageErrors, [])
  assert.equal(result.cases.length, 21)
  assert.deepEqual(result.cases.filter(entry => entry.id.startsWith('registration/')).map(entry => entry.id), ids)
  let count = 0
  for (const entry of result.cases) {
    assert.equal(entry.complete, true)
    assert.deepEqual(entry.errors, [])
    for (const observation of entry.observations) {
      const actualStatus = isDeepStrictEqual(observation.actual, observation.expected) ? 'PASS' : 'FAIL'
      assert.equal(observation.status, actualStatus, `Stale verdict: ${source.label}/${entry.id}/${observation.property}`)
      allObservations++
      if (source.label === 'candidate') assert.equal(actualStatus, 'PASS')
    }
    if (!entry.id.startsWith('registration/')) continue
    const expectedProperties = [...common]
    if (entry.id.includes('/renderTo/')) expectedProperties.push('sameDataInvalidatesRegistryRevision', 'replacementOwner', 'replacementDisposer')
    if (entry.id.endsWith('/placeholder')) expectedProperties.push('unknownPlaceholder')
    assert.deepEqual(entry.observations.map(item => item.property).sort(), expectedProperties.sort())
    for (const item of entry.observations) assert.equal(item.status, 'PASS')
    const values = Object.fromEntries(entry.observations.map(item => [item.property, item.actual]))
    assert.deepEqual(values.initialOutput, ['A:Author <literal>', 'A:Author <literal>'])
    assert.equal(values.newRegistryOwnsNewOutput, 'B:Author <literal>')
    assert.equal(values.reregisteredOutput, 'C:Author <literal>')
    assert.deepEqual(values.retainedUsesOriginalDisposer, [{ token: 'A-2', by: 'A' }])
    assert.deepEqual(values.unregisteredTypes, [])
    count += entry.observations.length
  }
  assert.equal(count, 246)
  registrationObservations += count
}
for (const [path, expected] of Object.entries(raw.dependencyFiles)) {
  const absolute = resolve(dependencies, path)
  assert(absolute.startsWith(dependencies + sep), 'Dependency path escaped its installed root')
  assert.equal(digest(await readFile(absolute)), expected, `Dependency bytes changed: ${path}`)
  dependencyFiles++
}
assert.equal(digest(await readFile('tests/browser/renderer-lifetime-parity-fixture.js')), raw.fixtureSha256)
console.log(JSON.stringify({ acceptedScope: 'RENDERER_REGISTRATION', candidate: sha(candidate), sources: 4,
  registrationCasesPerSource: 12, registrationObservationsPerSource: 246, registrationObservations,
  allVerdictsRecomputed: allObservations, sourceModulesVerified: modules, dependencyFilesVerified: dependencyFiles,
  candidateExceptions: [], excludes: ['RENDERER_ERRORS', 'whole-library acceptance'] }, null, 2))
