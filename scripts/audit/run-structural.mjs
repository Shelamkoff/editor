import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { git, hashFile, recordCommand, sha256, sourceIdentity, writeJson } from './browser-audit-support.mjs'
import { requireSuccessfulCommand, runStructuralReviewControls } from './structural-review-controls.mjs'

const BASELINE = '8761946d0d202b7fe74adfbb3bdc1b49fc245ba8'
const STAGES = ['controls', 'timing', 'attribution', 'memory']

export function fullStructuralEnvironment(inherited, repo) {
  const env = { ...inherited }
  for (const name of Object.keys(env)) if (name.startsWith('EDITOR_STRUCTURAL_')) delete env[name]
  return { ...env, EDITOR_STRUCTURAL_WARMUP: '5', EDITOR_STRUCTURAL_SAMPLES: '21',
    EDITOR_STRUCTURAL_STAGES: STAGES.join(','), EDITOR_DEPENDENCIES_ROOT: join(repo, 'node_modules') }
}

export function verifyStructuralRaw(raw, { baseline, candidate, chromePath }) {
  assert.equal(raw.outcome, 'passed')
  assert.equal(raw.sourceUnchanged, true)
  assert.deepEqual(raw.pageErrors, [])
  assert.deepEqual(raw.serverErrors, [])
  assert.equal(raw.warmup, 5)
  assert.equal(raw.repeats, 21)
  assert.deepEqual(raw.requestedStages, STAGES)
  assert.deepEqual(raw.sources.map(source => [source.label, source.sha, source.storage]),
    [['baseline', baseline, 'git-object'], ['candidate', candidate, 'git-object']])
  assert.equal(raw.environment.browser, '151.0.7922.34')
  assert.equal(raw.environment.chromePath, chromePath)
}

async function main() {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  assert(process.env.EDITOR_RESULTS_DIR && process.env.EDITOR_AUDIT_RUNTIME_RECEIPT, 'Require current-run results and the pinned browser receipt')
  const output = resolve(process.env.EDITOR_RESULTS_DIR, 'structural-audit')
  const rawDirectory = resolve(process.env.EDITOR_RESULTS_DIR, 'structural')
  await mkdir(output, { recursive: true })
  const report = { startedAt: new Date().toISOString(), baseline: BASELINE, rawDirectory, retries: 0,
    warmup: 5, samples: 21, stages: STAGES, expectedShapes: 7, expectedArtifacts: 112, pass: false,
    qualification: 'Maintained semantic, traversal, trace, allocation and retention checks. Timing distributions retain slower paths; PASS does not establish a universal speedup.' }
  await writeJson(join(output, 'plan.json'), report)
  let before, runtime
  try {
    before = await sourceIdentity(repo)
    assert.equal(before.diffSha256, sha256(''), 'Require a committed, clean candidate')
    assert.equal(git(repo, 'ls-files', '--others', '--exclude-standard').toString().trim(), '')
    if (process.env.GITHUB_SHA) assert.equal(before.head, process.env.GITHUB_SHA)
    assert.equal(git(repo, 'rev-parse', BASELINE + '^{commit}').toString().trim(), BASELINE)
    report.sourceBefore = before
    runtime = JSON.parse(await readFile(process.env.EDITOR_AUDIT_RUNTIME_RECEIPT, 'utf8'))
    assert.equal(runtime.pass, true)
    assert.deepEqual(runtime.expected, { playwright: '1.62.1', chromium: '151.0.7922.34', revision: '1234' })
    assert.equal(process.env.EDITOR_CHROME_PATH, runtime.EDITOR_CHROME_PATH)
    assert.equal(process.env.EDITOR_PLAYWRIGHT_PATH, runtime.EDITOR_PLAYWRIGHT_PATH)
    assert.equal(await hashFile(runtime.EDITOR_CHROME_PATH), runtime.executableSha256)
    assert.equal(await hashFile(runtime.EDITOR_PLAYWRIGHT_PATH), runtime.playwrightModuleSha256)
    report.runtime = runtime
    const env = fullStructuralEnvironment(process.env, repo)
    const run = await recordCommand(output, 'benchmark', [process.execPath, 'benchmarks/structural-authoring.mjs',
      'git:' + BASELINE, 'git:' + before.head, rawDirectory], { cwd: repo, env, timeoutMs: 24 * 60_000 })
    const { stdout, stderr, ...processReceipt } = run
    report.benchmark = processReceipt
    requireSuccessfulCommand(run)
    const raw = JSON.parse(await readFile(join(rawDirectory, 'results.json'), 'utf8'))
    verifyStructuralRaw(raw, { baseline: BASELINE, candidate: before.head, chromePath: runtime.EDITOR_CHROME_PATH })
    report.review = await runStructuralReviewControls({ repo, directory: rawDirectory, baseline: BASELINE,
      candidate: before.head, output: join(output, 'review'), env })
    assert.equal(report.review.pass, true, 'Maintained review or corruption controls failed')
    report.pass = true
  } catch (error) { report.pass = false; report.error = String(error.stack ?? error) }
  finally {
    try {
      if (before) {
        report.sourceAfter = await sourceIdentity(repo)
        assert.deepEqual(report.sourceAfter, before, 'Candidate changed during structural verification')
        report.sourceUnchanged = true
      }
      if (runtime) {
        assert.equal(await hashFile(runtime.EDITOR_CHROME_PATH), runtime.executableSha256)
        assert.equal(await hashFile(runtime.EDITOR_PLAYWRIGHT_PATH), runtime.playwrightModuleSha256)
        report.runtimeUnchanged = true
      }
    } catch (error) { report.pass = false; report.finalizationError = String(error.stack ?? error) }
    report.finishedAt = new Date().toISOString()
    await writeJson(join(output, 'result.json'), report)
  }
  console.log(JSON.stringify({ pass: report.pass, output, rawDirectory }))
  if (!report.pass) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
