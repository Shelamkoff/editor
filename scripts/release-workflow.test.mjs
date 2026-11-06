import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8')
const section = workflow.split('      - name: Run release gate\n')[1]?.split('\n      - name:')[0]
assert.ok(section, 'Verify library must retain its release gate step')
const literal = section.split('        run: |\n')[1]
assert.ok(literal, 'release gate must contain the actual shell dispatch')
const shell = literal.split('\n').map(line => line.replace(/^          /, '')).join('\n')
const options = { skip: process.platform === 'win32' }
const commands = {
  browser: ['npm', 'run', 'test:browser'],
  package: ['npm', 'run', 'test:package'],
  docs: ['bash', '-c', 'npm run test:docs && npm run docs:check'],
  'size-report': ['node', 'benchmarks/bundle-budget.mjs'],
}

function runner(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rector-release-shell-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  writeFileSync(join(directory, 'node'), `#!${process.execPath}\nconsole.log(JSON.stringify(process.argv.slice(2)));\nprocess.exit(Number(process.env.RECTOR_TEST_GATE_EXIT || 0));\n`, { mode: 0o755 })
  return (gate, exitCode = 0) => spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', shell], {
    encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, PATH: `${directory}${delimiter}${process.env.PATH || ''}`, GATE: gate, RECTOR_TEST_GATE_EXIT: String(exitCode) },
  })
}

test('all release gates keep their complete command, build prerequisite and required failures', options, t => {
  const run = runner(t)
  assert.doesNotMatch(workflow, /continue-on-error\s*:/)
  assert.match(workflow, /group: verify-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}-\$\{\{ github\.sha \}\}/,
    'A new source commit must not cancel a full verification already running for another commit')
  assert.match(workflow, /node: \['20\.19\.0', '22', '24', '26'\]/)
  assert.match(workflow, /gate: \[browser, package, docs, size-report\]/)
  for (const [gate, command] of Object.entries(commands)) {
    const result = run(gate)
    assert.equal(result.status, 0, `${gate}: ${result.stderr}`)
    assert.deepEqual(JSON.parse(result.stdout), ['scripts/verification-results.mjs', 'run', gate, '--require', 'build', '--', ...command], gate)
  }
})

test('every release gate propagates nonzero command exits', options, t => {
  const run = runner(t)
  for (const gate of Object.keys(commands)) {
    for (const exitCode of [1, 23]) {
      const result = run(gate, exitCode)
      assert.equal(result.status, exitCode, `${gate}: ${result.stdout}\n${result.stderr}`)
    }
  }
})

test('an unknown release gate fails without launching a substitute command', options, t => {
  const result = runner(t)('unknown-gate')
  assert.equal(result.status, 2)
  assert.equal(result.stdout, '')
})
