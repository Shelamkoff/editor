import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const repo = process.cwd()
const base = 'cd446e5866d09881011176d881278fff6449c6ef'
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const head = git('rev-parse', 'HEAD').toString().trim()
const digest = value => createHash('sha256').update(value).digest('hex')
const harnessPath = 'tests/browser/regressions/harness.js'
const harness = git('show', `${base}:${harnessPath}`).toString()
assert.equal(harness, await readFile(join(repo, harnessPath), 'utf8'))
const declaration = 'export async function run() {\n'
assert.equal(harness.split(declaration).length, 2)
const observedHarness = harness.replace(declaration, declaration
  + '  window.__registrationInventory = cases.map(entry => entry.name)\n'
  + '  document.body.dataset.status = "inventory-only"\n'
  + '  return\n')
const originalEntry = git('show', `${base}:tests/browser/native-plugin-parity.js`).toString()
const { chromium } = await import(pathToFileURL(process.env.EDITOR_PLAYWRIGHT_PATH).href)
const port = await new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => { const number = server.address().port; server.close(() => resolve(number)) })
})
const vite = spawn(process.execPath, [join(repo, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: repo, stdio: 'ignore' })
const origin = `http://127.0.0.1:${port}`
let browser
const results = []
try {
  const deadline = Date.now() + 20_000
  while (true) {
    if (vite.exitCode !== null) throw new Error('Inventory dev server exited: ' + vite.exitCode)
    try { if ((await fetch(origin + '/tests/browser/native-plugin-parity.html')).ok) break } catch {}
    if (Date.now() > deadline) throw new Error('Inventory dev server did not start')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath: process.env.EDITOR_CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  for (const [label, path, expected] of [
    ['original', 'native-plugin-parity.html', 444],
    ['remaining', 'native-plugin-parity.html', 333],
    ['settings', 'native-block-settings.html', 33],
    ['code', 'native-code-source-language.html', 20],
    ['person', 'native-person-modes.html', 28],
    ['table', 'native-table-keyboard.html', 30],
  ]) {
    const page = await browser.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.stack ?? String(error)))
    await page.route('**/tests/browser/regressions/harness.js*', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: observedHarness }))
    if (label === 'original') await page.route('**/tests/browser/native-plugin-parity.js*', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: originalEntry }))
    await page.goto(origin + '/tests/browser/' + path)
    await page.waitForFunction(() => Array.isArray(window.__registrationInventory))
    const names = await page.evaluate(() => window.__registrationInventory)
    assert.equal(names.length, expected, `${label} registration count`)
    assert.deepEqual(errors, [], `${label} registration errors`)
    results.push({ label, page: path, names, errors })
    await page.close()
  }
  const oldNames = results[0].names, newNames = results.slice(1).flatMap(row => row.names)
  assert.deepEqual([...newNames].sort(), [...oldNames].sort(), 'Registration multiset changed')
  assert.equal(new Set(oldNames).size, oldNames.length, 'Original registration names were not unique')
  assert.equal(new Set(newNames).size, newNames.length, 'Partition duplicated a registration')
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), head)
  assert.equal(git('diff', '--name-only', 'HEAD').toString().trim(), '')
  console.log(JSON.stringify({ kind: 'registration-inventory-only', base, candidate: head, browser: browser.version(),
    sourceUnchanged: true, originalEntrySha256: digest(originalEntry), originalHarnessSha256: digest(harness),
    inventoryHarnessSha256: digest(observedHarness), runnerSha256: digest(await readFile(new URL(import.meta.url))),
    productionOrFixtureExecutionClaimed: false,
    instrumentation: 'Only run() is replaced by an early inventory return. Imported modules execute their real test(name, callback) registration; no callbacks run and no test PASS is fabricated.',
    exactMultisetPreserved: true, duplicateNames: [], originalCount: oldNames.length, partitionCount: newNames.length, results,
  }, null, 2))
} finally {
  await browser?.close()
  vite.kill('SIGTERM')
  await new Promise(resolve => { if (vite.exitCode !== null) resolve(); else vite.once('exit', resolve) })
}
