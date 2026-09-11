import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { editorRoot, vitePath, findChrome } from './environment.mjs'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

function start(executable, args) {
  const child = spawn(executable, args, { cwd: fileURLToPath(editorRoot), stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', failure = null
  const capture = data => { output = (output + data).slice(-24_000) }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  child.on('error', error => { failure = error })
  return {
    child,
    output: () => output,
    assertRunning() {
      if (failure) throw failure
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Process exited: ${child.exitCode ?? child.signalCode}\n${output}`)
    },
  }
}

async function waitForJson(url, process, select) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    process.assertRunning()
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) {
        const result = select(await response.json())
        if (result) return result
      }
    } catch {}
    await pause(100)
  }
  throw new Error(`Timed out waiting for ${url}\n${process.output()}`)
}

class CdpClient {
  #socket
  #next = 0
  #pending = new Map()
  errors = []

  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('CDP connection timeout')) }, 10_000)
      socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')) }, { once: true })
    })
    return new CdpClient(socket)
  }

  constructor(socket) {
    this.#socket = socket
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const pending = this.#pending.get(message.id)
        if (!pending) return
        this.#pending.delete(message.id)
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
      } else if (message.method === 'Runtime.exceptionThrown') {
        // Harness-owned expected exceptions are adjudicated by the page. Keep
        // diagnostics for a page that fails or never reaches a terminal state.
        this.errors.push(message.params.exceptionDetails)
        if (this.errors.length > 20) this.errors.shift()
      }
    })
    socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) pending.reject(new Error('CDP connection closed'))
      this.#pending.clear()
    })
  }

  send(method, params = {}) {
    const id = ++this.#next
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new Error(`CDP ${method} timed out`)) }, 15_000)
      const settle = callback => value => { clearTimeout(timer); callback(value) }
      this.#pending.set(id, { resolve: settle(resolve), reject: settle(reject) })
      try { this.#socket.send(JSON.stringify({ id, method, params })) }
      catch (error) { this.#pending.delete(id); clearTimeout(timer); reject(error) }
    })
  }
  close() { this.#socket.close() }
}

async function runPage(client, chrome, url, label) {
  client.errors = []
  const navigation = await client.send('Page.navigate', { url })
  if (navigation.errorText) throw new Error(`${label}: ${navigation.errorText}`)
  await client.send('Page.bringToFront')
  const deadline = Date.now() + 120_000
  let last
  while (Date.now() < deadline) {
    chrome.assertRunning()
    const response = await client.send('Runtime.evaluate', {
      expression: `({url:location.href,status:document.body?.dataset.status,summary:document.querySelector('#result')?.textContent})`,
      returnByValue: true,
    })
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
    last = response.result?.value
    // Navigation may not have committed yet; never accept the preceding page.
    if (last?.url === url && last.status === 'pass') {
      console.log(`${label}: ${last.summary ?? 'summary unavailable'}`)
      return
    }
    if (last?.url === url && last.status === 'fail') throw new Error(`Browser gate failed for ${label}\n${last.summary}`)
    await pause(50)
  }
  throw new Error(`Timed out waiting for ${label}\n${JSON.stringify(last)}\n${JSON.stringify(client.errors)}\n${chrome.output()}`)
}

async function stop(process) {
  if (!process || process.child.exitCode !== null || process.child.signalCode !== null) return
  const closed = new Promise(resolve => process.child.once('close', resolve))
  process.child.kill()
  const timer = setTimeout(() => process.child.kill('SIGKILL'), 5000)
  try { await closed } finally { clearTimeout(timer) }
}

const labels = ['harness-contract.html', 'roundtrip.html', 'history.html', 'selection.html', 'lifecycle.html', 'security.html', 'action-label-security.html', 'audit-regressions.html', 'attaches-abort-urls.html', 'mention.html', 'poll.html', 'carousel.html', 'plugin-surfaces.html', 'imports.html', 'audit.html', 'recheck.html']
const pages = process.env.EDITOR_BROWSER_PAGE ? labels.filter(label => label === process.env.EDITOR_BROWSER_PAGE) : labels
if (!pages.length) throw new Error(`Unknown browser page: ${process.env.EDITOR_BROWSER_PAGE}`)
const chromePath = findChrome()
const port = await freePort(), debugPort = await freePort()
const profile = await mkdtemp(join(tmpdir(), 'rector-page-tests-'))
let vite, chrome, client
try {
  vite = start(process.execPath, [vitePath, '--host', '127.0.0.1', '--port', String(port), '--strictPort'])
  const deadline = Date.now() + 20_000
  while (true) {
    vite.assertRunning()
    try { if ((await fetch(`http://127.0.0.1:${port}/tests/browser/${pages[0]}`, { signal: AbortSignal.timeout(1000) })).ok) break } catch {}
    if (Date.now() >= deadline) throw new Error(`Vite startup timeout\n${vite.output()}`)
    await pause(100)
  }
  // Real time and a visible page target allow rAF and ResizeObserver delivery.
  // No bundle injection, CSS aggregation or virtual-time shortcut is involved.
  chrome = start(chromePath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'])
  const target = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`, chrome, targets => targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl))
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  for (const label of pages) await runPage(client, chrome, `http://127.0.0.1:${port}/tests/browser/${label}`, label)
} finally {
  client?.close()
  await Promise.all([stop(chrome), stop(vite)])
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
