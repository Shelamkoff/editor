// Validate a complete raw corpus without changing historical or current results.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachesFilesCases, plannedAttachesFilesPhases } from '../../tests/browser/attaches-files-parity-fixture.js'

const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const equal = (actual, expected, label) => assert.deepEqual(stable(actual), stable(expected), label)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const repo = fileURLToPath(new URL('../../', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const dependencyRoot = resolve(process.env.EDITOR_DEPENDENCIES_ROOT ?? fileURLToPath(new URL('../../node_modules/', import.meta.url)))
assert(process.argv[2], 'Pass the full raw JSON result path')
const raw = JSON.parse(await readFile(process.argv[2], 'utf8'))
assert.equal(raw.filter, '', 'A filtered run cannot accept the full row')
assert.equal(raw.fixtureSha256, digest(await readFile(new URL('../../tests/browser/attaches-files-parity-fixture.js', import.meta.url))))
assert.equal(raw.runnerSha256, digest(await readFile(new URL('./attaches-files.mjs', import.meta.url))))
equal(raw.sources.map(source => source.label), ['v1', 'spec-baseline', 'candidate'])
assert.equal(raw.sources[0].object, '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340')
assert.equal(raw.sources[1].object, 'e981ff308000c1d92d7e820df95113c1e19bcee8')
equal(raw.serverErrors, []); equal(raw.exceptions, []); assert.equal(raw.candidatePass, true)

// Check every loaded product byte against its immutable Git object, including
// both stylesheets and the real picker/renderer owners. No worktree module is
// an admissible replacement for a pinned product module.
for (const source of raw.sources) {
  assert.equal(git('rev-parse', source.ref).toString().trim(), source.object)
  assert.equal(git('cat-file', '-t', source.object).toString().trim(), source.objectType)
  assert.equal(git('rev-parse', `${source.object}^{tree}`).toString().trim(), source.tree)
  for (const path of ['core/index.js', 'plugins/attaches/index.js', 'plugins/shared/fileInput.js',
    'renderer/index.js', 'renderer/renderers/attaches/index.js', 'plugins/attaches/attaches.css',
    'renderer/renderers/attaches/styles.css', ...(source.legacy ? [] : ['shared/blockSchemas/attaches.js'])]) {
    assert(Object.hasOwn(source.loaded, path), `Missing loaded owner: ${source.label}/${path}`)
  }
  for (const [path, hash] of Object.entries(source.loaded)) {
    assert.equal(digest(git('show', `${source.tree}:${path}`)), hash, `${source.label}/${path}`)
  }
}
assert(Object.keys(raw.dependencyFiles).length > 0)
for (const [path, hash] of Object.entries(raw.dependencyFiles)) {
  assert(!path.startsWith('/') && !path.split('/').includes('..'))
  assert.equal(digest(await readFile(resolve(dependencyRoot, path))), hash, `dependency/${path}`)
}
for (const [name, version] of Object.entries(raw.dependencyVersions)) {
  assert.equal(JSON.parse(await readFile(resolve(dependencyRoot, name, 'package.json'), 'utf8')).version, version)
}

const commonProperties = ['documentLength', 'blockIdentity', 'canonicalFiles', 'variant', 'callerInput',
  'providerOutputUnchanged', 'history', 'editorNames', 'editableCount', 'editorMetadata', 'rendererFiles', 'unsafeUrlEffect']
const phaseProperties = (specification, phase, legacy) => {
  if (phase === 'destroy') return ['releasedOwnedUrls', 'providerOutputUnchanged']
  const properties = [...commonProperties]
  if (!legacy) {
    properties.push('fileIdsValid')
    if (phase !== 'load') properties.push('fileIdsStable')
    if (specification.populated) properties.push('existingId')
  }
  if (phase === 'source') {
    if (specification.route === 'picker') properties.push('multipleFilePicker')
    if (specification.route === 'drop') properties.push('dropHandled')
    properties.push('providerCalls', 'pickerEvents', 'pickerActivations', 'pickerRemoved',
      'allocatedFiles', 'distinctObjectUrls', 'noEarlyRevocation')
  }
  if (phase === 'redo-rename' && specification.source === 'local') {
    properties.push(...Array.from({ length: specification.count }, (_, index) => `localBytes/${index}`))
  }
  if (phase === 'read-only') properties.push('sourceControlsAbsent')
  if (phase === 'editable') properties.push('noSourceRestart')
  return properties
}

const summary = []
for (const result of raw.results) {
  equal(result.errors, []); equal(result.casePageErrors, []); equal(result.incompleteCases, []); equal(result.failures, [])
  equal(result.cases.map(entry => entry.id), attachesFilesCases.map(entry => entry.id))
  const legacy = result.source === 'v1', unsupported = []
  for (const [index, entry] of result.cases.entries()) {
    const specification = attachesFilesCases[index], label = `${result.source}/${entry.id}`
    const absent = legacy && specification.route === 'drop' && specification.populated
    assert.equal(Boolean(entry.unsupported), absent, label)
    assert.equal(entry.error, null, label); equal(entry.pageErrors, [], label)
    if (absent) {
      equal(entry.observations, [], label); equal(entry.completedPhases, [], label); equal(entry.phases, [], label); equal(entry.trusted, [], label)
      unsupported.push({ id: entry.id, reason: entry.unsupported })
      continue
    }
    const phases = plannedAttachesFilesPhases(specification)
    equal(entry.completedPhases, phases, label); equal(entry.plannedPhases, phases, label)
    equal(entry.phases.map(value => value.phase), phases.filter(phase => phase !== 'destroy'), label)
    const tuples = phases.flatMap(phase => phaseProperties(specification, phase, legacy).map(property => `${phase}/${property}`))
    equal(entry.observations.map(value => `${value.phase}/${value.property}`).sort(), tuples.sort(), label)
    for (const observation of entry.observations) {
      assert.equal(observation.status, 'PASS', `${label}/${observation.phase}/${observation.property}`)
      equal(observation.actual, observation.expected, `${label}/${observation.phase}/${observation.property}`)
    }
    equal(entry.trusted, [specification.route === 'drop'
      ? { phase: 'source', type: 'drop', trusted: false, controlledDataTransfer: true }
      : { phase: 'source', type: 'click', trusted: true, intendedControl: true },
    ...(!specification.outcome ? [{ phase: 'rename', type: 'input', trusted: true, inputType: 'insertText' }] : [])], label)
  }
  equal(result.unsupportedCases, unsupported)
  assert.equal(unsupported.length, legacy ? 2 : 0)
  const observations = result.cases.reduce((sum, entry) => sum + entry.observations.length, 0)
  assert.equal(observations, legacy ? 1742 : 2336)
  summary.push({ source: result.source, executableCases: result.cases.length - unsupported.length,
    unsupported: unsupported.length, observations, rawFailures: result.failures.length })
}
equal(summary.map(result => result.source), ['v1', 'spec-baseline', 'candidate'])
console.log(JSON.stringify({ candidate: raw.sources[2].object, candidateTree: raw.sources[2].tree,
  fixtureSha256: raw.fixtureSha256, runnerSha256: raw.runnerSha256, summary, candidateExceptions: [],
  note: 'Complete observations, executed triggers and loaded bytes verified; raw statuses are unchanged.' }, null, 2))
