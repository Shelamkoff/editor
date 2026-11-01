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
const cases = ['language-keyboard', 'language-cancel-no-match', 'injected-runtime', 'provider-throws', 'provider-retired',
  'lazy-default', 'lazy-delayed', 'lazy-failed', 'lazy-retired', 'copy-native', 'copy-read-only',
  'copy-native-denied', 'copy-rejected', 'copy-unavailable', 'copy-empty', 'copy-pending-retired',
  'renderer-injected', 'renderer-provider-throws', 'renderer-lazy-default', 'renderer-lazy-delayed',
  'renderer-lazy-failed', 'renderer-lazy-retired', 'renderer-lazy-replaced', 'renderer-lazy-provider-retired',
  'renderer-copy-native', 'renderer-copy-native-denied', 'renderer-copy-unavailable', 'renderer-copy-pending-retired']
assert.deepEqual(raw.selectedCases, cases)
assert.deepEqual(raw.sources.map(source => [source.label, source.sha]), [
  ['v1', sha('5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340')],
  ['spec-baseline', sha('e981ff308000c1d92d7e820df95113c1e19bcee8')],
  ['pre-fix', sha('69c8425e0081fde69cf5176ccb73d032720c15fc')],
  ['candidate', sha(candidate)],
])
assert.equal(raw.headBefore, sha(candidate))
assert.equal(raw.headAfter, raw.headBefore)
assert.deepEqual(raw.serverErrors, [])
assert.equal(raw.candidatePass, true)
assert.equal(raw.results.length, 4 * cases.length)
const literal = 'const value = "<b>&copy;</b>";\n// café'
let verdicts = 0, candidateObservations = 0
for (const source of raw.sources) {
  const results = raw.results.filter(entry => entry.source === source.label)
  assert.deepEqual(results.map(entry => entry.name), cases)
  assert.equal(results.reduce((sum, entry) => sum + entry.observations.length, 0), 573)
  for (const entry of results) {
    assert.equal(entry.error, null)
    assert.deepEqual(entry.errors, [])
    assert.equal(entry.incomplete, false)
    assert(entry.completedPhases.includes('dispose'))
    const failures = []
    for (const item of entry.observations) {
      const status = isDeepStrictEqual(item.actual, item.expected) ? 'PASS' : 'FAIL'
      assert.equal(item.status, status, `Stale verdict: ${source.label}/${entry.name}/${item.phase}/${item.property}`)
      if (status !== 'PASS') failures.push(item)
      if (source.label === 'candidate') { assert.equal(status, 'PASS'); candidateObservations++ }
      verdicts++
    }
    assert.deepEqual(entry.failures, failures)
    if (['copy-native', 'copy-read-only', 'renderer-copy-native'].includes(entry.name)) {
      const control = entry.observations.filter(item => item.phase === 'copy-control')
      assert.deepEqual(control.map(item => item.property), ['source', 'distinctSeed'])
      const text = entry.name.startsWith('renderer-') ? literal : literal + 'X'
      assert.equal(control[0].actual, text)
      assert.equal(control[1].actual, false)
      const clipboard = entry.observations.find(item => item.phase === 'copy' && ['clipboard', 'actualClipboard'].includes(item.property))
      assert(clipboard)
      assert([text, text.replace(/\n/g, '\r\n')].includes(clipboard.expected), 'Native reference changed more than newline representation')
      assert.equal(clipboard.actual, clipboard.expected)
      const paste = entry.observations.find(item => item.phase === 'copy' && item.property === 'nativePaste')
      assert(paste); assert.equal(paste.actual, text); assert.equal(paste.expected, text)
    }
    if (source.label === 'candidate' && ['copy-native-denied', 'renderer-copy-native-denied'].includes(entry.name)) {
      const denial = entry.observations.find(item => item.property === 'realNativeRejection')
      assert(denial)
      assert.deepEqual(denial.actual, [{ text: literal, state: 'rejected', name: 'NotAllowedError' }])
    }
  }
}
let modules = 0, dependencyFiles = 0, highlighterInputs = 0
for (const source of raw.sources) for (const [path, expected] of Object.entries(source.loaded)) {
  assert.equal(digest(git('show', `${source.sha}:${path}`)), expected, `Source differs: ${source.label}/${path}`)
  modules++
}
for (const [records, kind] of [[raw.dependencyFiles, 'dependency'], [raw.highlighterInputs, 'highlighter']]) {
  for (const [path, expected] of Object.entries(records)) {
    const file = resolve(dependencies, path)
    assert(file.startsWith(dependencies + sep), 'Dependency path escaped its installed root')
    assert.equal(digest(await readFile(file)), expected, `Installed bytes differ: ${path}`)
    if (kind === 'dependency') dependencyFiles++
    else highlighterInputs++
  }
}
assert.equal(digest(git('show', `${sha(candidate)}:tests/browser/code-controls-parity-fixture.js`)), raw.fixtureSha256)
assert.equal(digest(git('show', `${sha(candidate)}:tests/browser/code-renderer-parity-fixture.js`)), raw.rendererFixtureSha256)
console.log(JSON.stringify({ acceptedScope: 'BLOCK_CODE_HIGHLIGHT_COPY', candidate: sha(candidate), casesPerSource: 28,
  observationsPerSource: 573, candidateObservations, verdictsRecomputed: verdicts,
  sourceModulesVerified: modules, dependencyFilesVerified: dependencyFiles, highlighterInputsVerified: highlighterInputs,
  candidateExceptions: [], nativeClipboard: 'Exact product bytes match an independent native write/read reference; a different seed requires a real copy.',
  historicalFailuresRetained: true }, null, 2))
