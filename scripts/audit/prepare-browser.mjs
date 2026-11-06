import assert from 'node:assert/strict'
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { hashFile, recordCommand, writeJson } from './browser-audit-support.mjs'

const expected = { playwright: '1.62.1', chromium: '151.0.7922.34', revision: '1234' }
// Hosted dependency downloads have taken over ten minutes; product runs keep
// their own unchanged deadlines.
const chromiumInstallTimeoutMs = 15 * 60_000
assert.equal(process.platform, 'linux', 'This audit setup targets the Linux hosted runner')
assert(process.env.EDITOR_RESULTS_DIR, 'Set EDITOR_RESULTS_DIR to a fresh audit results directory')
const output = resolve(process.env.EDITOR_RESULTS_DIR, 'browser-runtime')
await mkdir(output, { recursive: true })
const runtime = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), 'rector-browser-audit-'))
const browsers = join(runtime, 'browsers')
const plan = { expected, runtime, browsers, node: process.version, startedAt: new Date().toISOString(), installsAttempted: 1, chromiumInstallTimeoutMs }
await writeJson(join(output, 'plan.json'), plan)
const success = run => assert(run.exitCode === 0 && !run.signal && !run.timedOut && !run.spawnError && !run.receivedSignal,
  `${run.name} did not complete successfully; inspect its immutable command receipt and logs`)
try {
  success(await recordCommand(output, 'npm-playwright', ['npm', 'install', '--prefix', runtime, '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', `playwright@${expected.playwright}`], { cwd: runtime }))
  const packagePath = join(runtime, 'node_modules/playwright/package.json')
  const descriptorPath = join(runtime, 'node_modules/playwright-core/browsers.json')
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'))
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'))
  const chromiumDescriptor = descriptor.browsers.find(browser => browser.name === 'chromium')
  assert.equal(manifest.version, expected.playwright)
  assert.equal(chromiumDescriptor?.browserVersion, expected.chromium)
  assert.equal(chromiumDescriptor?.revision, expected.revision)
  await writeFile(join(output, 'runtime-package-lock.json'), await readFile(join(runtime, 'package-lock.json')), { flag: 'wx' })
  await writeFile(join(output, 'browsers.json'), await readFile(descriptorPath), { flag: 'wx' })
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsers
  success(await recordCommand(output, 'install-chromium', [process.execPath, join(runtime, 'node_modules/playwright/cli.js'), 'install', '--with-deps', '--no-shell', 'chromium'], { cwd: runtime, timeoutMs: chromiumInstallTimeoutMs }))
  const modulePath = join(runtime, 'node_modules/playwright/index.mjs')
  const { chromium } = await import(pathToFileURL(modulePath).href)
  const executable = chromium.executablePath()
  const version = await recordCommand(output, 'chromium-version', [executable, '--version'], { cwd: runtime, timeoutMs: 30_000 })
  success(version)
  assert(version.stdout.includes(expected.chromium), 'Installed Chromium did not report the pinned version')
  const values = { EDITOR_PLAYWRIGHT_PATH: modulePath, EDITOR_CHROME_PATH: executable,
    PLAYWRIGHT_BROWSERS_PATH: browsers, EDITOR_AUDIT_RUNTIME_RECEIPT: join(output, 'runtime.json') }
  const receipt = { ...plan, finishedAt: new Date().toISOString(), pass: true, ...values,
    actualVersion: version.stdout.trim(), chromiumDescriptor, executableSha256: await hashFile(executable),
    playwrightModuleSha256: await hashFile(modulePath), browsersJsonSha256: await hashFile(descriptorPath),
    packageLockSha256: await hashFile(join(runtime, 'package-lock.json')) }
  await writeJson(values.EDITOR_AUDIT_RUNTIME_RECEIPT, receipt)
  if (process.env.GITHUB_ENV) {
    for (const value of Object.values(values)) assert(!/[\r\n]/.test(value), 'Unsafe environment path')
    await appendFile(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''))
  }
  console.log(JSON.stringify({ pass: true, expected, ...values }))
} catch (error) {
  await writeJson(join(output, 'setup-failure.json'), { ...plan, pass: false, finishedAt: new Date().toISOString(), error: String(error.stack ?? error) })
  throw error
}
