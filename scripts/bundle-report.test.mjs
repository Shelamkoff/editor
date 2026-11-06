import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))
const script = fileURLToPath(new URL('../benchmarks/bundle-budget.mjs', import.meta.url))

test('the actual plugin size report does not fail a release for exceeding a size target', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rector-bundle-report-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [script], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, EDITOR_VITE_MODULE_PATH: undefined, EDITOR_VITE_PATH: undefined, EDITOR_RESULTS_DIR: directory },
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /gzipKiB/, 'the measurement must still be reported')
  assert.match(result.stdout, /gzipBytes/, 'byte-level changes must remain visible')
  const report = JSON.parse(await readFile(join(directory, 'bundle-size.json'), 'utf8'))
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.mode, 'report')
  assert.deepEqual(report.rows.map(row => row.preset), ['core', 'paragraph', 'defaultInteractive', 'fullPreset'])
  assert.deepEqual(report.rows.map(row => row.referenceBytes), [51, 40, 64, 96].map(value => value * 1024))
  for (const row of report.rows) {
    assert.ok(Number.isSafeInteger(row.rawBytes) && row.rawBytes > 0)
    assert.ok(Number.isSafeInteger(row.gzipBytes) && row.gzipBytes > 0)
    assert.equal(row.deltaBytes, row.gzipBytes - row.referenceBytes)
    assert.equal(row.aboveReference, row.deltaBytes > 0)
    assert.ok(row.staticChunks.length > 0 && row.staticModules.length > 0)
  }
})

test('report mode exposes oversized output while manual enforcement keeps core informational', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rector-bundle-policy-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const bundler = join(directory, 'fixture-vite.mjs')
  await writeFile(bundler, String.raw`
import { createHash } from 'node:crypto'
const payload = Array.from({ length: 4096 }, (_, index) => createHash('sha256').update(String(index)).digest('hex')).join('')
export async function build(config) {
  const input = config.build.rollupOptions.input
  const grow = process.env.RECTOR_TEST_BUNDLE_CORE_ONLY !== '1' || input.replaceAll('\\', '/').endsWith('/dist/core/index.js')
  const code = grow ? 'export const payload = ' + JSON.stringify(payload) + ';' : 'export const value = 1;'
  return { output: [{ type: 'chunk', fileName: 'entry.js', isEntry: true, code, imports: [], dynamicImports: [], modules: { [input]: { renderedLength: code.length } } }] }
}
`)
  const run = (enforce, coreOnly = false) => spawnSync(process.execPath, [script, ...(enforce ? ['--enforce'] : [])], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, EDITOR_VITE_MODULE_PATH: bundler, EDITOR_VITE_PATH: undefined, EDITOR_RESULTS_DIR: directory,
      RECTOR_TEST_BUNDLE_CORE_ONLY: coreOnly ? '1' : '0' },
  })
  const reportResult = run(false)
  assert.equal(reportResult.status, 0, `${reportResult.stdout}\n${reportResult.stderr}`)
  const report = JSON.parse(await readFile(join(directory, 'bundle-size.json'), 'utf8'))
  assert.ok(report.rows.every(row => row.aboveReference && row.deltaBytes > 0))
  const enforced = run(true)
  assert.notEqual(enforced.status, 0)
  assert.match(enforced.stderr, /paragraph entry.*reference target/)
  const strictReport = JSON.parse(await readFile(join(directory, 'bundle-size.json'), 'utf8'))
  assert.equal(strictReport.mode, 'enforce')
  assert.deepEqual(strictReport.rows, report.rows, '--enforce changes policy, not measured bytes')
  const coreOnly = run(true, true)
  assert.equal(coreOnly.status, 0, `${coreOnly.stdout}\n${coreOnly.stderr}`)
  const coreReport = JSON.parse(await readFile(join(directory, 'bundle-size.json'), 'utf8'))
  assert.deepEqual(coreReport.rows.filter(row => row.aboveReference).map(row => row.preset), ['core'])
})

test('the size report still fails when its bundler cannot be loaded', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, EDITOR_VITE_MODULE_PATH: fileURLToPath(new URL('./missing-vite-report-module.mjs', import.meta.url)) },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /ERR_MODULE_NOT_FOUND/)
})
