import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// A checkout name and neighboring repositories are not part of the build API.
test('declarations build in a standalone checkout with an arbitrary directory name', async t => {
  const sourceRoot = fileURLToPath(new URL('../', import.meta.url))
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'rector-checkout-'))
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }))
  const checkout = join(temporaryRoot, 'custom editor name')
  await mkdir(checkout)
  for (const path of ['core', 'plugins', 'inline-tools', 'inline-plugins', 'locale', 'shared', 'renderer',
    'scripts', 'package.json', 'index.d.ts', 'types.d.ts', 'I18n.d.ts']) {
    await cp(join(sourceRoot, path), join(checkout, path), { recursive: true })
  }
  await symlink(join(sourceRoot, 'node_modules'), join(checkout, 'node_modules'), 'junction')
  const result = spawnSync(process.execPath, [join(checkout, 'scripts/generate-declarations.mjs'), '--out', 'dist'], {
    cwd: temporaryRoot,
    encoding: 'utf8',
    timeout: 60_000,
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.ok((await readFile(join(checkout, 'dist/core/index.d.ts'), 'utf8')).length > 0)
})
