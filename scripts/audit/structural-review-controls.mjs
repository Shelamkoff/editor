import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { git, hashFile, recordCommand, sha256, writeJson } from './browser-audit-support.mjs'

const REVIEWER = 'scripts/parity/checkpoints/2026-11-05/library-recheck/structural-review.mjs'
export const STRUCTURAL_CORRUPTIONS = Object.freeze(['source', 'sample-count', 'distribution', 'trusted-native-input',
  'live-memory-control', 'retained-memory', 'trace-reconstruction'])

function completed(run, exitCode) {
  assert.equal(run.exitCode, exitCode, 'Unexpected structural process exit')
  assert(!run.signal && !run.receivedSignal && !run.timedOut && !run.spawnError,
    'A launch failure, timeout or interruption is not a structural result')
}

export function requireSuccessfulCommand(run) { completed(run, 0) }

export function verifyStructuralReview(run, expected) {
  completed(run, 0)
  const value = JSON.parse(run.stdout)
  assert.equal(value.status, 'PASS')
  assert.equal(value.mode, 'complete', 'Timing-only evidence cannot satisfy the full structural gate')
  for (const key of ['baseline', 'candidate', 'reviewerSha256', 'resultSha256']) assert.equal(value[key], expected[key], `Wrong structural ${key}`)
  assert.equal(value.modules, 370)
  assert.equal(value.quantiles, 336)
  assert.equal(value.artifactCount, 112)
  assert.equal(Object.keys(value.artifacts).length, 112)
  assert.equal(value.comparisons.length, 6)
  return value
}

export function verifyStructuralCorruption(run) {
  completed(run, 1)
  assert.equal(run.stdout.trim(), '', 'A rejected corruption cannot also publish a successful review')
  assert.match(run.stderr, /^AssertionError(?: \[ERR_ASSERTION\])?:/m, 'Expected an oracle assertion, not an infrastructure failure')
}

export function corruptStructuralResult(original, name) {
  assert(STRUCTURAL_CORRUPTIONS.includes(name), 'Unknown structural corruption')
  const value = structuredClone(original)
  switch (name) {
    case 'source': value.sources[1].sha = '0'.repeat(40); break
    case 'sample-count': value.timings[0].rawSamples.pop(); break
    case 'distribution': value.timings[0].summaries[0].metrics.synchronousMs.p50 = -1; break
    case 'trusted-native-input': value.controls.find(row => row.kind === 'native').observations[0].trustedNativeInput = false; break
    case 'live-memory-control': value.memory[0].observation.livePositiveControl = false; break
    case 'retained-memory': value.memory[0].observation.retainedReleasedObjects = 1; break
    case 'trace-reconstruction': value.attribution[0].trace.windows[0].totals.Layout.count = -1; break
  }
  assert.notDeepEqual(value, original, 'Corruption did not change the positive result')
  return value
}

const receipt = ({ stdout, stderr, ...value }) => value

/** Run the maintained oracle first on the real result, then on seven separate
 * corrupt copies. Historical review scripts and actual artifacts remain intact. */
export async function runStructuralReviewControls({ repo, directory, baseline, candidate, output, env = process.env, execute = recordCommand }) {
  assert(/^[a-f0-9]{40}$/.test(baseline) && /^[a-f0-9]{40}$/.test(candidate), 'Use complete commit identities')
  await mkdir(output, { recursive: true })
  const report = { startedAt: new Date().toISOString(), baseline, candidate, directory: resolve(directory),
    reviewer: REVIEWER, plannedCorruptions: STRUCTURAL_CORRUPTIONS, controls: [], pass: false }
  await writeJson(join(output, 'plan.json'), report)
  try {
    const originalBytes = await readFile(join(directory, 'results.json'))
    const original = JSON.parse(originalBytes)
    const expected = { baseline, candidate, reviewerSha256: await hashFile(join(repo, REVIEWER)), resultSha256: sha256(originalBytes) }
    const command = [process.execPath, REVIEWER, resolve(directory), baseline, candidate]
    const positive = await execute(output, 'positive', command, { cwd: repo, env, timeoutMs: 120_000 })
    report.positiveProcess = receipt(positive)
    report.positive = verifyStructuralReview(positive, expected)
    // Never interpret rejection of corrupt copies unless the unchanged source
    // report passed the very same oracle in this invocation.
    for (const name of STRUCTURAL_CORRUPTIONS) {
      const folder = join(output, name)
      await mkdir(folder, { recursive: true })
      const override = join(folder, 'corrupt.json')
      await writeFile(override, JSON.stringify(corruptStructuralResult(original, name)) + '\n', { flag: 'wx' })
      const run = await execute(folder, 'review', [...command, override], { cwd: repo, env, timeoutMs: 120_000 })
      const control = { corruption: name, rejected: false, overrideSha256: await hashFile(override), process: receipt(run) }
      report.controls.push(control)
      try { verifyStructuralCorruption(run); control.rejected = true }
      catch (error) { control.error = String(error.stack ?? error) }
      if (run.receivedSignal) throw new Error('Structural controls interrupted by ' + run.receivedSignal)
    }
    assert.equal(await hashFile(join(directory, 'results.json')), expected.resultSha256, 'Original raw result changed during controls')
    assert.equal(await hashFile(join(repo, REVIEWER)), expected.reviewerSha256, 'Maintained reviewer changed during controls')
    for (const [name, digest] of Object.entries(report.positive.artifacts)) {
      assert(/^[a-z0-9-]+\.(?:trace|allocation)\.json\.gz$/.test(name))
      assert.equal(await hashFile(join(directory, name)), digest, 'Structural artifact changed: ' + name)
    }
    report.originalArtifactsUnchanged = true
    report.pass = report.controls.length === STRUCTURAL_CORRUPTIONS.length && report.controls.every(row => row.rejected)
  } catch (error) { report.error = String(error.stack ?? error) }
  finally {
    report.finishedAt = new Date().toISOString()
    await writeJson(join(output, 'result.json'), report)
  }
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, baselineRef, candidateRef, output, ...extra] = process.argv.slice(2)
  assert(directory && baselineRef && candidateRef && output && !extra.length,
    'Provide structural directory, baseline, candidate and a fresh control-output directory')
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const commit = ref => git(repo, 'rev-parse', ref + '^{commit}').toString().trim()
  const report = await runStructuralReviewControls({ repo, directory: resolve(directory),
    baseline: commit(baselineRef), candidate: commit(candidateRef), output: resolve(output),
    env: { ...process.env, EDITOR_DEPENDENCIES_ROOT: join(repo, 'node_modules') } })
  console.log(JSON.stringify({ pass: report.pass, rejectedCorruptions: report.controls.filter(row => row.rejected).length, output: resolve(output) }))
  if (!report.pass) process.exitCode = 1
}
