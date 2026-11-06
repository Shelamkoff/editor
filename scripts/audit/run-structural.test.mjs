import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fullStructuralEnvironment, verifyStructuralRaw } from './run-structural.mjs'
import { STRUCTURAL_CORRUPTIONS, corruptStructuralResult, verifyStructuralReview,
  verifyStructuralCorruption, requireSuccessfulCommand, runStructuralReviewControls } from './structural-review-controls.mjs'

const baseline = 'a'.repeat(40), candidate = 'b'.repeat(40)
const expected = { baseline, candidate, reviewerSha256: 'c'.repeat(64), resultSha256: 'd'.repeat(64) }
const completed = extra => ({ exitCode: 0, signal: null, receivedSignal: null, timedOut: false, spawnError: null,
  stdout: '', stderr: '', ...extra })
const positive = extra => ({ status: 'PASS', mode: 'complete', ...expected, modules: 370, quantiles: 336,
  artifactCount: 112, artifacts: Object.fromEntries(Array.from({ length: 112 }, (_, n) => [`artifact-${n}.trace.json.gz`, 'e'.repeat(64)])),
  comparisons: Array(6).fill({}), ...extra })
const raw = extra => ({ outcome: 'passed', sourceUnchanged: true, pageErrors: [], serverErrors: [], warmup: 5, repeats: 21,
  requestedStages: ['controls', 'timing', 'attribution', 'memory'],
  sources: [{ label: 'baseline', sha: baseline, storage: 'git-object' }, { label: 'candidate', sha: candidate, storage: 'git-object' }],
  environment: { browser: '151.0.7922.34', chromePath: '/runtime/chrome' }, ...extra })

test('structural audit removes every inherited selector and fixes the full sampling contract', () => {
  const inherited = { PATH: '/safe/bin', EDITOR_STRUCTURAL_FILTER: 'small', EDITOR_STRUCTURAL_STAGES: 'timing',
    EDITOR_STRUCTURAL_WARMUP: '0', EDITOR_STRUCTURAL_SAMPLES: '1', EDITOR_STRUCTURAL_FUTURE_SELECTOR: 'partial' }
  const copy = structuredClone(inherited), env = fullStructuralEnvironment(inherited, '/repo')
  assert.deepEqual(inherited, copy)
  assert.equal(env.PATH, '/safe/bin')
  assert.deepEqual(Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('EDITOR_STRUCTURAL_'))), {
    EDITOR_STRUCTURAL_WARMUP: '5', EDITOR_STRUCTURAL_SAMPLES: '21', EDITOR_STRUCTURAL_STAGES: 'controls,timing,attribution,memory',
  })
  assert.equal(env.EDITOR_DEPENDENCIES_ROOT, '/repo/node_modules')
})

test('structural raw receipt cannot accept a small run, failed source or different runtime', () => {
  verifyStructuralRaw(raw(), { baseline, candidate, chromePath: '/runtime/chrome' })
  for (const change of [{ requestedStages: ['timing'] }, { warmup: 0 }, { repeats: 1 }, { outcome: 'failed' },
    { sourceUnchanged: false }, { pageErrors: ['unexpected'] }, { serverErrors: ['missing module'] },
    { environment: { browser: '156.0.8078.79', chromePath: '/runtime/chrome' } },
    { sources: [{ label: 'baseline', sha: baseline, storage: 'git-object' }, { label: 'candidate', sha: '0'.repeat(40), storage: 'git-object' }] }]) {
    assert.throws(() => verifyStructuralRaw(raw(change), { baseline, candidate, chromePath: '/runtime/chrome' }))
  }
})

test('positive review requires complete coverage and exact source, reviewer and result identities', () => {
  assert.equal(verifyStructuralReview(completed({ stdout: JSON.stringify(positive()) }), expected).status, 'PASS')
  for (const change of [{ mode: 'small-input-repeat' }, { artifactCount: 111 }, { artifacts: {} }, { modules: 369 },
    { quantiles: 335 }, { comparisons: [] }, { candidate: baseline }, { reviewerSha256: 'wrong' }, { resultSha256: 'wrong' }]) {
    assert.throws(() => verifyStructuralReview(completed({ stdout: JSON.stringify(positive(change)) }), expected))
  }
  assert.throws(() => verifyStructuralReview(completed({ stdout: JSON.stringify(positive()) + JSON.stringify(positive()) }), expected))
})

test('no successful-looking report can hide an unsuccessful or interrupted command', () => {
  for (const change of [{ exitCode: 1 }, { signal: 'SIGTERM' }, { receivedSignal: 'SIGINT' }, { timedOut: true }, { spawnError: 'EACCES' }]) {
    assert.throws(() => requireSuccessfulCommand(completed(change)))
    assert.throws(() => verifyStructuralReview(completed({ stdout: JSON.stringify(positive()), ...change }), expected))
  }
})

test('negative controls require real assertion rejection and never accept infrastructure failure', () => {
  const rejected = completed({ exitCode: 1, stderr: 'AssertionError [ERR_ASSERTION]: corrupt observation' })
  verifyStructuralCorruption(rejected)
  for (const change of [{ exitCode: 0 }, { exitCode: 2 }, { signal: 'SIGTERM' }, { receivedSignal: 'SIGTERM' },
    { timedOut: true }, { spawnError: 'EACCES' }, { stderr: 'ENOENT results.json' },
    { stderr: 'Error: ENOENT /tmp/AssertionError/input.json' }, { stdout: JSON.stringify(positive()) }]) {
    assert.throws(() => verifyStructuralCorruption({ ...rejected, ...change }))
  }
})

test('all seven independent corruptions change only a copy of the positive raw result', () => {
  const original = { sources: [{}, { sha: candidate }], timings: [{ rawSamples: [[1], [2]], summaries: [{ metrics: { synchronousMs: { p50: 1 } } }] }],
    controls: [{ kind: 'native', observations: [{ trustedNativeInput: true }] }],
    memory: [{ observation: { livePositiveControl: true, retainedReleasedObjects: 0 } }],
    attribution: [{ trace: { windows: [{ totals: { Layout: { count: 0 } } }] } }] }
  const copy = structuredClone(original)
  assert.deepEqual(STRUCTURAL_CORRUPTIONS, ['source', 'sample-count', 'distribution', 'trusted-native-input',
    'live-memory-control', 'retained-memory', 'trace-reconstruction'])
  for (const name of STRUCTURAL_CORRUPTIONS) assert.notDeepEqual(corruptStructuralResult(original, name), original)
  assert.deepEqual(original, copy)
  assert.throws(() => corruptStructuralResult(original, 'unknown'))
})

test('failed positive control cannot be masked by seven easy corruption rejections', async t => {
  const root = await mkdtemp(join(tmpdir(), 'structural-positive-control-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const reviewer = join(root, 'scripts/parity/checkpoints/2026-11-05/library-recheck')
  await mkdir(reviewer, { recursive: true })
  await writeFile(join(reviewer, 'structural-review.mjs'), 'export {}\n')
  const directory = join(root, 'raw'); await mkdir(directory)
  await writeFile(join(directory, 'results.json'), '{}\n')
  let invocations = 0
  const result = await runStructuralReviewControls({ repo: root, directory, baseline, candidate, output: join(root, 'review'),
    execute: async () => { invocations++; return completed({ exitCode: 1, stderr: 'AssertionError: wrong source identity' }) } })
  assert.equal(result.pass, false)
  assert.equal(invocations, 1)
  assert.equal(result.controls.length, 0)
})
