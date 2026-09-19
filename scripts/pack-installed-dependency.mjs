import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Repack an already installed dependency without running any npm lifecycle.
 * The published manifest and runtime bytes remain unchanged; nested installed
 * dependencies are supplied separately by the offline consumer fixture.
 * @param {string} packageRoot
 * @param {string} destination
 * @returns {Promise<string>} Absolute path of the npm-compatible tarball.
 */
export async function packInstalledDependency(packageRoot, destination) {
  const source = resolve(packageRoot)
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  if (typeof manifest.name !== 'string' || !manifest.name || typeof manifest.version !== 'string' || !manifest.version) {
    throw new TypeError('Installed dependency must declare a name and version')
  }
  const filename = `${manifest.name}-${manifest.version}.tgz`.replace(/^@/, '').replace(/[\\/]/g, '-')
  const tarball = resolve(destination, filename)
  await mkdir(resolve(destination), { recursive: true })
  const staging = await mkdtemp(join(tmpdir(), 'rector-installed-package-'))
  try {
    await cp(source, join(staging, 'package'), {
      recursive: true,
      filter: path => basename(path) !== 'node_modules',
    })
    execFileSync('tar', ['-czf', tarball, '-C', staging, 'package'], { stdio: 'pipe' })
    return tarball
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
