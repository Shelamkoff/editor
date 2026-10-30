import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const root = resolve(process.argv[2]), loaded = new Map(), serverErrors = []
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return }
    const path = resolve(root, '.' + pathname)
    if (!path.startsWith(root + '/')) throw new Error('Escaped probe root')
    if (!loaded.has(path)) loaded.set(path, await readFile(path))
    response.setHeader('content-type', extname(path) === '.html' ? 'text/html' : extname(path) === '.css' ? 'text/css' : 'text/javascript')
    response.end(loaded.get(path))
  } catch (error) { serverErrors.push(String(error)); response.writeHead(500).end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.EDITOR_CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage(), pageErrors = []
  page.on('pageerror', error => pageErrors.push(String(error.stack ?? error)))
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/browser/auto-height.html`)
  let executionError
  try { await page.waitForFunction(() => document.body.dataset.status !== 'running', null, { timeout: 10_000 }) }
  catch (error) { executionError = String(error) }
  const output = await page.evaluate(() => {
    const text = document.querySelector('#result').textContent
    return { status: document.body.dataset.status, ...(text === 'running' ? { unfinished: true } : JSON.parse(text)) }
  })
  let sourceUnchanged = true
  for (const [path, bytes] of loaded) if (!bytes.equals(await readFile(path))) sourceUnchanged = false
  console.log(JSON.stringify({ root, browser: await browser.version(), runnerSha256: digest(await readFile(new URL(import.meta.url))),
    sourceUnchanged, loadedFiles: Object.fromEntries([...loaded].map(([path, bytes]) => [path.slice(root.length + 1), digest(bytes)])),
    executionError, pageErrors, serverErrors, ...output }, null, 2))
  if (output.status !== 'pass' || output.cases?.length !== 4 || pageErrors.length || serverErrors.length || !sourceUnchanged) process.exitCode = 1
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
