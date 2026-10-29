import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Reconstruct measured modules from a published commit. The original local
// candidate commits are identities, not prerequisites for replay.
const checkpoint = dirname(fileURLToPath(import.meta.url))
const repo = resolve(process.env.RECTOR_INLINE_REPO ?? execFileSync('git',
  ['rev-parse', '--show-toplevel'], { cwd: checkpoint, encoding: 'utf8' }).trim())
const dependencies = resolve(process.env.RECTOR_INLINE_DEPENDENCIES ?? join(repo, 'node_modules'))
const prepareOnly = process.argv.includes('--prepare-only')
assert(process.argv.slice(2).every(argument => argument === '--prepare-only'), 'Only --prepare-only is accepted')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const manifest = JSON.parse(await readFile(join(checkpoint, 'REPRODUCTION-MANIFEST.json'), 'utf8'))
const observed = JSON.parse(await readFile(join(checkpoint, 'result-linear.json'), 'utf8'))
for (const [name, expected] of Object.entries(manifest.artifactHashes)) {
  assert.equal(hash(await readFile(join(checkpoint, name))), expected, 'Changed checkpoint artifact: ' + name)
}

const output = await mkdtemp(join(tmpdir(), 'rector-inline-range-replay-'))
const sourcePaths = Object.keys(observed.files).filter(url => url.startsWith('/baseline/'))
  .map(url => url.slice('/baseline/'.length))
const archive = execFileSync('git', ['archive', manifest.publishedAnchor, ...sourcePaths,
  'package.json', 'package-lock.json'], { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const variants = []
for (const variant of manifest.variants) {
  const root = join(output, variant.label)
  await mkdir(root)
  execFileSync('tar', ['-x', '-C', root], { input: archive })
  for (const patch of variant.patches) {
    const path = join(checkpoint, patch)
    execFileSync('git', ['apply', '--check', path], { cwd: root })
    execFileSync('git', ['apply', path], { cwd: root })
  }
  assert.equal(hash(await readFile(join(root, 'package-lock.json'))), observed.lockSha256,
    'Reconstructed dependency lock differs from the recorded input')
  variants.push({ label: variant.label, commit: variant.commit, root })
}
for (const [url, expected] of Object.entries(observed.files)) {
  const [, label, ...parts] = url.split('/')
  const root = label === 'dependencies' ? dependencies : variants.find(variant => variant.label === label)?.root
  assert(root, 'Unexpected recorded module URL: ' + url)
  assert.equal(hash(await readFile(join(root, ...parts))), expected, 'Reconstruction differs: ' + url)
}
await writeFile(join(output, 'fixture.js'), await readFile(join(checkpoint, 'fixture.js')))
await writeFile(join(output, 'variants.json'), JSON.stringify(variants, null, 2) + '\n')
await writeFile(join(output, 'source-hashes.json'), JSON.stringify(observed.files, null, 2) + '\n')

// Keep the measured runner byte-for-byte in the checkpoint. Relocate only its
// environment and replace git-object verification with the recorded hashes.
// Neither the browser fixture nor its timed update/ordering/assertions change.
let runner = await readFile(join(checkpoint, 'recorded-runner.mjs'), 'utf8')
const changes = []
const replaceOnce = (before, after, reason) => {
  assert(runner.includes(before) && runner.indexOf(before) === runner.lastIndexOf(before),
    'Expected one recorded runner fragment: ' + reason)
  runner = runner.replace(before, () => after)
  changes.push(reason)
}
const playwright = process.env.RECTOR_INLINE_PLAYWRIGHT
  ? pathToFileURL(resolve(process.env.RECTOR_INLINE_PLAYWRIGHT)).href : 'playwright'
const chrome = process.env.EDITOR_CHROME_PATH
assert(prepareOnly || chrome, 'Set EDITOR_CHROME_PATH to the Chromium executable')
replaceOnce("import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'",
  'import { chromium } from ' + JSON.stringify(playwright), 'Playwright module location')
replaceOnce("const base = '/tmp/rector-inline-payload-benchmark'", 'const base = ' + JSON.stringify(output)
  + "\nconst expectedFiles = JSON.parse(await readFile(base + '/source-hashes.json', 'utf8'))", 'Replay directory and recorded hash input')
replaceOnce("const repo = '/tmp/rector-image-recovery-20261029'", 'const repo = ' + JSON.stringify(repo), 'Repository location')
replaceOnce("const dependencyRoot = repo + '/node_modules'", 'const dependencyRoot = ' + JSON.stringify(dependencies), 'Dependency location')
replaceOnce("if (source) assert.deepEqual(bytes, execFileSync('git', ['show', source.commit + ':' + relative],\n        { cwd: repo, maxBuffer: 64 * 1024 * 1024 }), 'Module bytes differ from the pinned commit')",
  "assert.equal(hash(bytes), expectedFiles[pathname], 'Module bytes differ from the recorded source')", 'Verify every served module against its recorded SHA-256')
replaceOnce("executablePath: '/tmp/rector-browsers/chrome-linux64/chrome'",
  'executablePath: ' + JSON.stringify(chrome ?? '/path/to/chromium'), 'Chromium executable location')
replaceOnce("readFile(repo + '/package-lock.json')", "readFile(variants[0].root + '/package-lock.json')", 'Use the reconstructed dependency lock')
await writeFile(join(output, 'runner.mjs'), runner)
execFileSync(process.execPath, ['--check', join(output, 'runner.mjs')])
const reconstruction = {
  classification: 'Historical decision replay; no production patch is applied to the working checkout',
  preparedAt: new Date().toISOString(), output, publishedAnchor: manifest.publishedAnchor,
  variants, checkedSourceAndDependencyFiles: Object.keys(observed.files).length,
  fixtureSha256: observed.fixtureSha256, recordedRunnerSha256: observed.runnerSha256,
  replayRunnerSha256: hash(runner), relocationChanges: changes,
  browserRequested: !prepareOnly, browserExecuted: false,
}
await writeFile(join(output, 'reconstruction.json'), JSON.stringify(reconstruction, null, 2) + '\n')
console.log(JSON.stringify(reconstruction, null, 2))
if (!prepareOnly) {
  execFileSync(process.execPath, [join(output, 'runner.mjs'), join(output, 'result-replay.json')],
    { stdio: 'inherit', env: { ...process.env, RECTOR_INLINE_VARIANTS: join(output, 'variants.json') } })
  reconstruction.browserExecuted = true
  await writeFile(join(output, 'reconstruction.json'), JSON.stringify(reconstruction, null, 2) + '\n')
}
