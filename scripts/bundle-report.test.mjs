import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../', import.meta.url))
const script = fileURLToPath(new URL('../benchmarks/bundle-budget.mjs', import.meta.url))

test('the actual plugin size report does not fail a release for exceeding a size target', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /gzipKiB/, 'the measurement must still be reported')
})

test('the size report still fails when its bundler cannot be loaded', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, EDITOR_VITE_MODULE_PATH: fileURLToPath(new URL('./missing-vite-report-module.mjs', import.meta.url)) },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /ERR_MODULE_NOT_FOUND/)
})
