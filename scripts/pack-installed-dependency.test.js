import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { packInstalledDependency } from './pack-installed-dependency.mjs'

test('installed dependency packing preserves bytes and never invokes prepare', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rector-pack-test-'))
  try {
    const source = join(root, 'installed')
    await mkdir(join(source, 'dist'), { recursive: true })
    await mkdir(join(source, 'node_modules', 'private-build-tool'), { recursive: true })
    const manifest = JSON.stringify({
      name: '@test/installed', version: '1.2.3', type: 'module',
      scripts: { prepare: 'node -e "throw new Error(\'must not run\')"' },
      exports: './dist/index.js',
    })
    const runtime = 'export const sentinel = "published bytes"\n'
    await writeFile(join(source, 'package.json'), manifest)
    await writeFile(join(source, 'dist', 'index.js'), runtime)
    await writeFile(join(source, 'node_modules', 'private-build-tool', 'secret.txt'), 'not published')
    const tarball = await packInstalledDependency(source, join(root, 'packed'))
    const readEntry = entry => execFileSync('tar', ['-xOf', tarball, entry], { encoding: 'utf8' })
    assert.equal(readEntry('package/package.json'), manifest)
    assert.equal(readEntry('package/dist/index.js'), runtime)
    assert.equal(await readFile(join(source, 'package.json'), 'utf8'), manifest)
    const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    assert.equal(entries.includes('node_modules'), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
