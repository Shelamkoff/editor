import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const editorRoot = new URL('../../', import.meta.url)
const serverRoot = new URL('../../../', import.meta.url)
const vitePath = process.env.EDITOR_VITE_PATH
  ?? fileURLToPath(new URL('node_modules/vite/bin/vite.js', serverRoot))
const chromePath = process.env.EDITOR_CHROME_PATH
  ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolvePort(address.port))
    })
  })
}

async function waitForHttp(url, process, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (process?.exitCode !== null) throw new Error(`Process exited with code ${process.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function findPageTarget(debugPort, expectedUrl, chrome) {
  const listUrl = `http://127.0.0.1:${debugPort}/json/list`
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}`)
    try {
      const response = await fetch(listUrl)
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find(item => item.type === 'page' && item.url === expectedUrl)
          ?? targets.find(item => item.type === 'page' && item.url.includes('/editor/tests/browser/lifecycle.html'))
        if (target?.webSocketDebuggerUrl) return target
      }
    } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Timed out waiting for Chrome target ${expectedUrl}`)
}

class CdpClient {
  #socket
  #nextId = 0
  #pending = new Map()
  #events = new Map()

  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, { once: true })
      socket.addEventListener('error', reject, { once: true })
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
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
        return
      }
      for (const listener of this.#events.get(message.method) ?? []) {
        listener(message.params)
      }
    })
    socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) pending.reject(new Error('CDP connection closed'))
      this.#pending.clear()
    })
  }

  send(method, params = {}) {
    const id = ++this.#nextId
    return new Promise((resolveResult, reject) => {
      this.#pending.set(id, { resolve: resolveResult, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, listener) {
    const listeners = this.#events.get(method) ?? []
    listeners.push(listener)
    this.#events.set(method, listeners)
  }

  close() {
    this.#socket.close()
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  }
  return result.result?.value
}

async function waitForLifecycle(client) {
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    const status = await evaluate(client, 'document.body?.dataset.status ?? "loading"')
    if (status === 'pass') return
    if (status === 'fail') {
      const details = await evaluate(client, 'document.querySelector("#result")?.textContent')
      throw new Error(`Lifecycle page failed: ${details}`)
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  }
  throw new Error('Timed out waiting for lifecycle page')
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  const closed = new Promise(resolveClosed => child.once('close', resolveClosed))
  child.kill()
  await Promise.race([
    closed,
    new Promise(resolveTimeout => setTimeout(resolveTimeout, 5000)),
  ])
}

const vitePort = await freePort()
const debugPort = await freePort()
const pageUrl = `http://127.0.0.1:${vitePort}/editor/tests/browser/lifecycle.html`
const userDataDir = await mkdtemp(join(tmpdir(), 'ophire-editor-heap-'))
const verifiedTempRoot = resolve(tmpdir())
const verifiedUserData = resolve(userDataDir)
if (!verifiedUserData.startsWith(verifiedTempRoot + '\\')) {
  throw new Error(`Refusing to use non-temporary Chrome profile: ${verifiedUserData}`)
}

const vite = spawn(process.execPath, [
  vitePath,
  '--host', '127.0.0.1',
  '--port', String(vitePort),
  '--strictPort',
], {
  cwd: fileURLToPath(serverRoot),
  stdio: 'ignore',
})

let chrome = null
let client = null
try {
  await waitForHttp(pageUrl, vite)
  chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    pageUrl,
  ], { stdio: 'ignore' })

  const target = await findPageTarget(debugPort, pageUrl, chrome)
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable')
  await client.send('HeapProfiler.enable')
  await waitForLifecycle(client)

  // WeakRef targets created by the lifecycle page are eligible only after its
  // final async job returns. Multiple explicit collections remove timing noise.
  await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  for (let pass = 0; pass < 3; pass++) {
    await client.send('HeapProfiler.collectGarbage')
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50))
  }

  const sentinels = await evaluate(client, 'window.__editorHeapReport?.()')
  if (!sentinels || sentinels.total === 0) throw new Error('Lifecycle page exposed no heap sentinels')
  if (sentinels.alive.length > 0) {
    throw new Error(`Destroyed editor resources retained after GC: ${sentinels.alive.join(', ')}`)
  }

  const usage = await client.send('Runtime.getHeapUsage')
  let snapshotBytes = 0
  client.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => {
    snapshotBytes += Buffer.byteLength(chunk)
  })
  await client.send('HeapProfiler.takeHeapSnapshot', {
    reportProgress: false,
    captureNumericValue: true,
    exposeInternals: false,
  })

  console.log(JSON.stringify({
    sentinels: sentinels.total,
    retained: sentinels.alive.length,
    usedHeapMiB: Number((usage.usedSize / 1024 / 1024).toFixed(2)),
    embedderHeapMiB: Number(((usage.embedderHeapUsedSize ?? 0) / 1024 / 1024).toFixed(2)),
    snapshotMiB: Number((snapshotBytes / 1024 / 1024).toFixed(2)),
  }))
} finally {
  client?.close()
  await Promise.all([stopProcess(chrome), stopProcess(vite)])
  await rm(userDataDir, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 200,
  })
}
