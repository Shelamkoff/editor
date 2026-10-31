// Check the entire raw corpus and the exact known historical differences.
// This does not rewrite raw FAIL statuses or waive any candidate assertion.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { attachesNamesVariantsCases, plannedAttachesPhases } from '../../tests/browser/attaches-names-variants-parity-fixture.js'

const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const equal = (actual, expected, label) => assert.deepEqual(stable(actual), stable(expected), label)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
assert(process.argv[2], 'Pass the full raw JSON result path')
const raw = JSON.parse(await readFile(process.argv[2], 'utf8'))
assert.equal(raw.filter, '', 'A filtered run cannot accept the full row')
assert.equal(raw.fixtureSha256, digest(await readFile(new URL('../../tests/browser/attaches-names-variants-parity-fixture.js', import.meta.url))))
assert.equal(raw.runnerSha256, digest(await readFile(new URL('./attaches-names-variants.mjs', import.meta.url))))
equal(raw.sources.map(source => source.label), ['v1', 'spec-baseline', 'candidate'])
assert.equal(raw.sources[0].object, '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340')
assert.equal(raw.sources[1].object, 'e981ff308000c1d92d7e820df95113c1e19bcee8')
equal(raw.serverErrors, [])
assert.equal(raw.candidatePass, true)

const variants = ['a', 'b', 'f', 'g']
const trimNames = rows => rows.map(row => ({ ...row,
  ...('name' in row ? { name: row.name.trim() } : {}),
  ...('download' in row ? { download: row.download.trim() } : {}),
}))
const expectedWhitespaceTuples = legacy => {
  const keys = new Set(['input/exactNativeFilename', 'input/canonicalFiles', 'input/rendererRows', 'blank-input/canonicalNameFallback'])
  const phases = ['variant', 'undo-variant', 'redo-input', 'redo-variant', 'read-only', 'editable', 'blank-readonly', 'blank-editable']
  if (legacy) {
    keys.add('load/canonicalFiles'); keys.add('load/rendererRows')
    keys.add('undo-variant/history'); keys.add('redo-input/history'); keys.add('redo-input/variant')
    phases.push('undo-input')
  }
  for (const phase of phases) for (const property of ['canonicalFiles', 'editorRows', 'rendererRows']) keys.add(`${phase}/${property}`)
  return keys
}

const summary = []
for (const result of raw.results) {
  equal(result.errors, []); equal(result.casePageErrors, []); equal(result.incompleteCases, [])
  equal(result.cases.map(entry => entry.id), attachesNamesVariantsCases.map(entry => entry.id))
  const legacy = result.source === 'v1', candidate = result.source === 'candidate'
  const flattenedFailures = []
  let groupSummaryDifferences = 0, whitespaceDifferences = 0, unsupported = 0
  for (const [index, entry] of result.cases.entries()) {
    const specification = attachesNamesVariantsCases[index]
    const absent = legacy && ['settings', 'reorder'].includes(specification.route)
    assert.equal(Boolean(entry.unsupported), absent, entry.id)
    if (absent) {
      unsupported++
      assert.equal(entry.error, null); equal(entry.observations, []); equal(entry.completedPhases, []); equal(entry.pageErrors, [])
      continue
    }
    assert.equal(entry.error, null); equal(entry.pageErrors, [])
    equal(entry.completedPhases, plannedAttachesPhases(specification))
    equal(entry.plannedPhases, plannedAttachesPhases(specification))
    assert(entry.observations.length > 0)
    const failures = entry.observations.filter(observation => observation.status !== 'PASS')
    for (const observation of entry.observations) {
      const matches = JSON.stringify(stable(observation.actual)) === JSON.stringify(stable(observation.expected))
      assert.equal(observation.status, matches ? 'PASS' : 'FAIL', `${entry.id}/${observation.phase}/${observation.property}`)
    }
    flattenedFailures.push(...failures.map(failure => ({ id: entry.id, ...failure })))
    if (candidate) { equal(failures, [], entry.id); continue }
    const expectedKeys = specification.edgeSpace ? expectedWhitespaceTuples(legacy) : new Set()
    if (legacy && specification.edgeSpace && specification.initial === 'a') {
      for (const property of ['groupTotalSize', 'groupCount', 'rendererGroupTotalSize']) expectedKeys.add(`redo-input/${property}`)
    }
    const observedKeys = new Set()
    for (const failure of failures) {
      const { phase, property, actual, expected } = failure
      const key = `${phase}/${property}`, label = `${result.source}/${entry.id}/${key}`
      if (!legacy && property === 'groupTotalSize') {
        const saved = entry.phases.find(value => value.phase === phase)?.blocks[0].data
        assert.equal(saved?.variant, 'a', label); assert.equal(saved?.files.length, 3, label)
        assert.equal(actual, '', label); assert.equal(expected, '1.0MB', label)
        groupSummaryDifferences++
        continue
      }
      assert(specification.edgeSpace, `Unexpected historical failure: ${label}`)
      assert(expectedKeys.has(key), `Unexpected historical tuple: ${label}`)
      assert(!observedKeys.has(key), `Duplicate historical tuple: ${label}`)
      observedKeys.add(key); whitespaceDifferences++
      if (['canonicalFiles', 'editorRows', 'rendererRows'].includes(property)) {
        // v1 discards the whitespace-only edit, so redo-input already replays
        // the variant action. The requested old presentation then has no rows.
        equal(actual, legacy && phase === 'redo-input' && property !== 'canonicalFiles' ? [] : trimNames(expected), label)
      } else if (['exactNativeFilename', 'canonicalNameFallback'].includes(property)) {
        assert.equal(actual, 'Report', label); assert.equal(expected, 'Report\u00a0', label)
      } else if (property === 'history') {
        equal(actual, phase === 'undo-variant' ? { canUndo: false, canRedo: true } : { canUndo: true, canRedo: false }, label)
        equal(expected, { canUndo: true, canRedo: true }, label)
      } else if (property === 'variant') {
        assert.equal(expected, specification.initial, label)
        assert.equal(actual, variants[(variants.indexOf(specification.initial) + 1) % 4], label)
      } else if (property === 'groupCount') {
        assert.equal(actual, undefined, label); assert.equal(expected, true, label)
      } else {
        assert.equal(actual, '', label); assert.equal(expected, '1.0MB', label)
      }
    }
    equal([...observedKeys].sort(), [...expectedKeys].sort(), `${result.source}/${entry.id}/complete historical differences`)
  }
  equal(result.failures, flattenedFailures)
  assert.equal(result.unsupportedCases.length, unsupported)
  assert.equal(unsupported, legacy ? 8 : 0)
  assert.equal(groupSummaryDifferences, result.source === 'spec-baseline' ? 54 : 0)
  assert.equal(whitespaceDifferences, candidate ? 0 : legacy ? 147 : 112)
  summary.push({ source: result.source, executableCases: result.cases.length - unsupported, unsupported,
    observations: result.cases.reduce((sum, entry) => sum + entry.observations.length, 0),
    rawFailures: result.failures.length, groupSummaryDifferences, whitespaceDifferences })
}
equal(summary.map(result => result.source), ['v1', 'spec-baseline', 'candidate'])
console.log(JSON.stringify({ candidateTree: raw.sources[2].tree, fixtureSha256: raw.fixtureSha256, runnerSha256: raw.runnerSha256,
  summary, candidateExceptions: [], note: 'Exact historical differences verified; original raw FAIL statuses are unchanged.' }, null, 2))
