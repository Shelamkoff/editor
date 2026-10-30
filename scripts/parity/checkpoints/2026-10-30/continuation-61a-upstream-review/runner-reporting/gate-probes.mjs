// Narrow deterministic probes of the actual result-aggregation/reporting code.
// This does not launch a browser or relabel historical observations.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const repo = '/workspace/scratch/61a2ad7355f4/editor'
const revision = process.argv[2], stage = process.argv[3]
assert(revision && stage)
const output = '/workspace/scratch/61a2ad7355f4/tools/runner-reporting-followup/' + stage
await mkdir(output, { recursive: true })
const digest = value => createHash('sha256').update(value).digest('hex')
const scripts = {
  columns: 'columns-layout-parity.mjs', text: 'text-block-settings.mjs',
  raw: 'raw-source-preview.mjs', tools: 'tool-actions.mjs',
}
const scenarios = ['positive', 'empty-candidate', 'empty-historical', 'server-error', 'page-error',
  'native-error', 'case-error', 'unsupported-current', 'missing-observations', 'missing-phase',
  'wrong-phase-same-count', 'empty-phase-plan', 'missing-candidate', 'historical-unsupported', 'historical-failure']
const report = { revision, scope: 'Actual runner aggregation and final report blocks on controlled result inputs; not browser coverage.', runners: [] }
for (const [name, filename] of Object.entries(scripts)) {
  const relative = 'scripts/parity/' + filename
  const bytes = revision === 'WORKTREE' ? await readFile(join(repo, relative))
    : execFileSync('git', ['show', `${revision}:${relative}`], { cwd: repo })
  const source = bytes.toString()
  const start = source.search(/^  const (?:passed =|candidate = results|current = results)/m)
  assert(start >= 0, name + ' missing reporting boundary')
  const end = source.indexOf('\n} finally', start)
  assert(end > start)
  const originalBlock = source.slice(start, end)
  // import.meta is metadata only; replace its URL so the unchanged gate body
  // can execute inside an isolated VM without importing the network runner.
  const block = originalBlock.replaceAll('import.meta.url', JSON.stringify('file://' + join(repo, relative)))
  const aggregationStart = source.indexOf('    results.push({ source:')
  const aggregationEnd = source.indexOf('    await page.close()', aggregationStart)
  assert(aggregationStart >= 0 && aggregationEnd > aggregationStart)
  const aggregation = source.slice(aggregationStart, aggregationEnd)
  const results = []
  for (const scenario of [...scenarios, ...(name === 'text' ? ['case-page-error'] : []), ...(name === 'tools' ? ['diagnostic'] : [])]) {
    const serverErrors = [], rows = []
    const labels = scenario === 'missing-candidate' ? ['v1', 'spec-baseline'] : ['v1', 'spec-baseline', 'candidate']
    for (const label of labels) {
      const entry = { id: 'controlled-result', observations: [{ phase: 'load', property: 'value', actual: 1, expected: 1, status: 'PASS' }],
        completedPhases: ['load', 'input'], plannedPhases: ['load', 'input'], planned: ['load', 'input'],
        error: null, diagnostics: [], ...(name === 'tools' ? { unsupported: [] } : {}), pageErrors: [] }
      let cases = [entry]
      const errors = [], pageErrors = [], inputErrors = []
      if (label === 'candidate') {
        if (scenario === 'empty-candidate') cases = []
        if (scenario === 'server-error') serverErrors.push('Controlled source-server failure')
        if (scenario === 'page-error') (name === 'tools' ? pageErrors : errors).push('Controlled page error')
        if (scenario === 'native-error') {
          if (name === 'tools') inputErrors.push('Controlled native bridge failure')
          else entry.error = 'Controlled native bridge rejection returned by fixture catch'
        }
        if (scenario === 'case-error') entry.error = 'Controlled incomplete fixture'
        if (scenario === 'unsupported-current') entry.unsupported = name === 'tools' ? [{ reason: 'Controlled unsupported current contract' }] : 'Controlled unsupported current contract'
        if (scenario === 'missing-observations') entry.observations = []
        if (scenario === 'missing-phase') entry.completedPhases.pop()
        if (scenario === 'wrong-phase-same-count') entry.completedPhases.reverse()
        if (scenario === 'empty-phase-plan') entry.completedPhases = entry.plannedPhases = entry.planned = []
        if (scenario === 'case-page-error') entry.pageErrors.push({ phase: 'load', message: 'Controlled per-case page error' })
        if (scenario === 'diagnostic') entry.diagnostics.push({ code: 'controlled-diagnostic' })
      }
      if (label === 'v1') {
        if (scenario === 'empty-historical') cases = []
        if (scenario === 'historical-unsupported') {
          entry.unsupported = name === 'tools' ? [{ reason: 'Historical observation API is absent' }] : 'Historical surface is absent'
          if (name === 'columns' || name === 'text') entry.observations = entry.completedPhases = []
        }
        if (scenario === 'historical-failure') entry.observations[0] = { ...entry.observations[0], actual: 2, status: 'FAIL' }
      }
      vm.runInNewContext(aggregation, { results: rows, source: { label }, cases, errors, pageErrors, inputErrors })
    }
    let parsed
    const targetProcess = { version: process.version, platform: process.platform, arch: process.arch, env: {}, exitCode: 0 }
    let error = null
    try {
      await vm.runInNewContext('(async () => {' + block + '\n})()', {
        results: rows, serverErrors, process: targetProcess, startedAt: 'controlled-reporting-probe',
        browser: { version: () => 'not-a-browser-run' }, headBefore: revision, headAfter: revision,
        sources: [], dependencyVersions: {}, dependencyFiles: {}, fixture: Buffer.alloc(0),
        runnerBytes: bytes, runnerPath: join(repo, relative), repo, filter: '',
        readFile, digest, join, fileURLToPath, console: { log: text => { parsed = JSON.parse(text) } },
      })
    } catch (caught) { error = String(caught) }
    const expectedCandidate = ['positive', 'empty-historical', 'historical-unsupported', 'historical-failure'].includes(scenario)
    const expectedExit = ['positive', 'historical-unsupported'].includes(scenario) ? 0 : 1
    const actual = { candidatePass: parsed?.candidatePass ?? null, exitCode: targetProcess.exitCode, error }
    const pass = !error && actual.candidatePass === expectedCandidate && actual.exitCode === expectedExit
    results.push({ scenario, expected: { candidatePass: expectedCandidate, exitCode: expectedExit }, actual, pass })
  }
  report.runners.push({ name, path: relative, runnerSha256: digest(bytes), reportBlockSha256: digest(originalBlock),
    aggregationBlockSha256: digest(aggregation), probes: results })
}
report.passed = report.runners.every(runner => runner.probes.every(probe => probe.pass))
await writeFile(join(output, 'gate-probes.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ revision, passed: report.passed, runners: report.runners.map(runner => ({ name: runner.name,
  probes: runner.probes.length, failed: runner.probes.filter(probe => !probe.pass).map(({ scenario, actual }) => ({ scenario, actual })) })) }, null, 2))
if (stage.startsWith('green')) assert(report.passed, 'A reporting gate still accepted invalid evidence')
