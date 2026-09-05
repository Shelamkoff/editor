import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('README checks use installed packages without sibling checkouts', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./readme-smoke.mjs', import.meta.url))], {
    cwd: tmpdir(), encoding: 'utf8', timeout: 60_000,
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.ok(result.stdout.includes('94'), 'all localized extension references must be checked')
})
