import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { editorRoot, vitePath, findChrome } from './environment.mjs'
const chromePath = findChrome()

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
  })
}

async function waitFor(url, server) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited with code ${server.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function collect(process) {
  let stdout = ''
  let stderr = ''
  process.stdout.on('data', chunk => { stdout += chunk })
  process.stderr.on('data', chunk => { stderr += chunk })
  const exitCode = await new Promise((resolve, reject) => {
    process.once('error', reject)
    process.once('close', resolve)
  })
  return { exitCode, stdout, stderr }
}

const port = await freePort()
const vite = spawn(process.execPath, [
  vitePath,
  '--host', '127.0.0.1',
  '--port', String(port),
  '--strictPort',
], {
  cwd: fileURLToPath(editorRoot),
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  const labels = ['roundtrip.html', 'history.html', 'selection.html', 'lifecycle.html', 'security.html', 'mention.html', 'poll.html', 'carousel.html', 'plugin-surfaces.html', 'imports.html', 'audit.html', 'recheck.html']
  let pages = labels.map(label => ({ label, path: `/tests/browser/${label}` }))
  if (process.env.EDITOR_BROWSER_PAGE) {
    pages = pages.filter(page => page.label === process.env.EDITOR_BROWSER_PAGE)
    if (pages.length === 0) throw new Error(`Unknown browser page: ${process.env.EDITOR_BROWSER_PAGE}`)
  }
  for (const page of pages) {
    const pageUrl = `http://127.0.0.1:${port}${page.path}`
    await waitFor(pageUrl, vite)
    const chrome = spawn(chromePath, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--virtual-time-budget=15000',
      '--dump-dom',
      pageUrl,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    const timeout = setTimeout(() => chrome.kill('SIGKILL'), 60_000)
    const result = await collect(chrome).finally(() => clearTimeout(timeout))
    if (result.exitCode !== 0 || !/<body\b[^>]*data-status="pass"/.test(result.stdout)) {
      throw new Error(`Browser gate failed for ${page.label}\n${result.stdout}\n${result.stderr}`)
    }
    const summary = result.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]
    console.log(`${page.label}: ${summary ?? 'summary unavailable'}`)
  }
} finally {
  vite.kill()
}
