import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { editorRoot, vitePath, findChrome } from './environment.mjs'
const chromePath = findChrome()

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
          ?? targets.find(item => item.type === 'page' && item.url.includes('/tests/browser/lifecycle.html'))
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
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`CDP ${method} timed out`))
      }, 60_000)
      this.#pending.set(id, {
        resolve: value => { clearTimeout(timer); resolveResult(value) },
        reject: error => { clearTimeout(timer); reject(error) },
      })
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

async function collectGarbage(client) {
  // A WeakRef dereference or an evaluated callback keeps its result alive for
  // that job. Let it return before requesting the same real collections used
  // by the existing lifecycle sentinels.
  await new Promise(resolveDelay => setTimeout(resolveDelay, 100))
  for (let pass = 0; pass < 3; pass++) {
    await client.send('HeapProfiler.collectGarbage')
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50))
  }
}

function countPayloadObjects(snapshot, { nonce, markerProperty, latestCase }) {
  const { nodes, edges, strings } = snapshot
  const meta = snapshot.snapshot.meta
  const nodeWidth = meta.node_fields.length, edgeWidth = meta.edge_fields.length
  const nodeType = meta.node_fields.indexOf('type'), nodeName = meta.node_fields.indexOf('name')
  const edgeCount = meta.node_fields.indexOf('edge_count')
  const edgeType = meta.edge_fields.indexOf('type'), edgeName = meta.edge_fields.indexOf('name_or_index')
  const toNode = meta.edge_fields.indexOf('to_node')
  if ([nodeType, nodeName, edgeCount, edgeType, edgeName, toNode].some(index => index < 0)) {
    throw new Error('Heap snapshot lacks the object/property metadata required by the history proof')
  }
  const nodeTypes = meta.node_types[nodeType], edgeTypes = meta.edge_types[edgeType]
  const counts = Array(latestCase + 1).fill(0)
  const prefix = nonce + ':'
  let edgeOffset = 0
  for (let nodeOffset = 0; nodeOffset < nodes.length; nodeOffset += nodeWidth) {
    const end = edgeOffset + nodes[nodeOffset + edgeCount] * edgeWidth
    if (nodeTypes[nodes[nodeOffset + nodeType]] === 'object') {
      for (let offset = edgeOffset; offset < end; offset += edgeWidth) {
        if (edgeTypes[edges[offset + edgeType]] !== 'property'
          || strings[edges[offset + edgeName]] !== markerProperty) continue
        const target = edges[offset + toNode]
        if (nodeTypes[nodes[target + nodeType]] !== 'string') continue
        const marker = strings[nodes[target + nodeName]]
        if (!marker.startsWith(prefix)) continue
        const suffix = marker.slice(prefix.length), index = Number(suffix)
        if (Number.isInteger(index) && index >= 1 && index <= latestCase && String(index) === suffix) counts[index]++
      }
    }
    edgeOffset = end
  }
  return counts
}

async function proveHistoryEviction(client) {
  const phases = []
  let chunks = null
  client.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => { chunks?.push(chunk) })
  const metadata = await evaluate(client, 'window.__editorHistoryHeap.start()')
  if (!metadata?.nonce || metadata.payloadBytes !== 32 * 1024 || metadata.latestCase !== 12) {
    throw new Error('History heap scenario did not initialize the expected live public editor')
  }
  async function capture(phase) {
    await collectGarbage(client)
    const usage = await client.send('Runtime.getHeapUsage')
    chunks = []
    await client.send('HeapProfiler.takeHeapSnapshot', {
      reportProgress: false, captureNumericValue: true, exposeInternals: false,
    })
    const source = chunks.join('')
    chunks = null
    const counts = countPayloadObjects(JSON.parse(source), metadata)
    const result = {
      phase, counts,
      usedHeapMiB: Number((usage.usedSize / 1024 / 1024).toFixed(2)),
      snapshotMiB: Number((Buffer.byteLength(source) / 1024 / 1024).toFixed(2)),
    }
    phases.push(result)
    console.log('History heap phase: ' + JSON.stringify(result))
    return counts
  }
  const requirePresent = (counts, indices, phase) => {
    for (const index of indices) if (counts[index] === 0) {
      throw new Error(`${phase}: missing retained payload control ${index}; counts=${JSON.stringify(counts)}`)
    }
  }
  const requireAbsent = (counts, indices, phase) => {
    for (const index of indices) if (counts[index] !== 0) {
      throw new Error(`${phase}: evicted history payload ${index} retained after GC; counts=${JSON.stringify(counts)}`)
    }
  }
  const before = await capture('before-eviction')
  requirePresent(before, [1, 2], 'before-eviction')
  await evaluate(client, 'window.__editorHistoryHeap.evict()')
  const evicted = Array.from({ length: metadata.latestCase - 2 }, (_, index) => index + 1)
  const retained = [metadata.latestCase - 1, metadata.latestCase]
  const after = await capture('after-eviction-with-retained-control')
  requirePresent(after, [metadata.retainedCase, ...retained], 'after-eviction')
  requireAbsent(after, evicted.filter(index => index !== metadata.retainedCase), 'after-eviction')
  await evaluate(client, 'window.__editorHistoryHeap.releaseControl()')
  const released = await capture('after-releasing-control')
  requirePresent(released, retained, 'after-releasing-control')
  requireAbsent(released, evicted, 'after-releasing-control')
  const replay = await evaluate(client, 'window.__editorHistoryHeap.verify()')
  return { payloadBytes: metadata.payloadBytes, authoredActions: metadata.latestCase, historyMaxBytes: 1,
    historyMaxStack: 100, retainedControlReleased: true, replay, phases }
}

const vitePort = await freePort()
const debugPort = await freePort()
const pageUrl = `http://127.0.0.1:${vitePort}/tests/browser/lifecycle.html`
const userDataDir = await mkdtemp(join(tmpdir(), 'ophire-editor-heap-'))
const verifiedTempRoot = resolve(tmpdir())
const verifiedUserData = resolve(userDataDir)
const relativeProfile = relative(verifiedTempRoot, verifiedUserData)
if (!relativeProfile || isAbsolute(relativeProfile) || relativeProfile === '..' || relativeProfile.startsWith('..' + sep)) {
  throw new Error(`Refusing to use non-temporary Chrome profile: ${verifiedUserData}`)
}

const vite = spawn(process.execPath, [
  vitePath,
  '--host', '127.0.0.1',
  '--port', String(vitePort),
  '--strictPort',
], {
  cwd: fileURLToPath(editorRoot),
  stdio: 'ignore',
  windowsHide: true,
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
  ], { stdio: 'ignore', windowsHide: true })

  const target = await findPageTarget(debugPort, pageUrl, chrome)
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable')
  await client.send('HeapProfiler.enable')
  console.log('Heap environment: ' + JSON.stringify({
    node: process.version, platform: process.platform, architecture: process.arch,
    executable: chromePath, ...await client.send('Browser.getVersion'),
  }))
  await waitForLifecycle(client)

  await collectGarbage(client)

  const sentinels = await evaluate(client, 'window.__editorHeapReport?.()')
  if (!sentinels || sentinels.total === 0) throw new Error('Lifecycle page exposed no heap sentinels')
  if (sentinels.alive.length > 0) {
    throw new Error(`Destroyed editor resources retained after GC: ${sentinels.alive.join(', ')}`)
  }

  const historyErrors = []
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    historyErrors.push(exceptionDetails.exception?.description ?? exceptionDetails.text)
  })
  const historyEviction = await proveHistoryEviction(client)
  await evaluate(client, 'window.__editorHistoryHeap.dispose()')
  await collectGarbage(client)
  const disposed = await evaluate(client, 'window.__editorHeapReport()')
  if (disposed.alive.length > 0) {
    throw new Error(`History scenario cleanup retained editor resources: ${disposed.alive.join(', ')}`)
  }
  if (historyErrors.length > 0) throw new Error(`History heap scenario raised browser errors: ${historyErrors.join('\n')}`)
  const usage = await client.send('Runtime.getHeapUsage')

  console.log(JSON.stringify({
    sentinels: disposed.total,
    retained: disposed.alive.length,
    usedHeapMiB: Number((usage.usedSize / 1024 / 1024).toFixed(2)),
    embedderHeapMiB: Number(((usage.embedderHeapUsedSize ?? 0) / 1024 / 1024).toFixed(2)),
    historyEviction,
  }))
} finally {
  if (client) {
    try { await evaluate(client, 'window.__editorHistoryHeap?.dispose()') }
    catch (error) { console.error('History heap cleanup failed:', error); process.exitCode = 1 }
  }
  client?.close()
  await Promise.all([stopProcess(chrome), stopProcess(vite)])
  await rm(userDataDir, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 200,
  })
}
