import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { editorRoot, vitePath, findChrome } from './environment.mjs'
const chromePath = findChrome()

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

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

async function waitForHttp(url, process, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Dev server exited with code ${process.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function findPageTarget(debugPort, pageUrl, chrome) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = response.ok ? await response.json() : []
      const target = targets.find(item => item.type === 'page' && item.url === pageUrl)
      if (target?.webSocketDebuggerUrl) return target
    } catch {}
    await delay(100)
  }
  throw new Error(`Timed out waiting for Chrome target ${pageUrl}`)
}

class CdpClient {
  #socket
  #nextId = 0
  #pending = new Map()
  #listeners = new Map()

  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    return new CdpClient(socket)
  }

  constructor(socket) {
    this.#socket = socket
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      if (!message.id) {
        for (const listener of this.#listeners.get(message.method) ?? []) listener(message.params)
        return
      }
      const pending = this.#pending.get(message.id)
      if (!pending) return
      this.#pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = ++this.#nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`CDP ${method} timed out`))
      }, 30_000)
      this.#pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value) },
        reject: error => { clearTimeout(timer); reject(error) },
      })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, listener) {
    const listeners = this.#listeners.get(method) ?? []
    listeners.push(listener)
    this.#listeners.set(method, listeners)
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

async function waitForEditor(client) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (await evaluate(client, 'document.querySelectorAll(".oe-block [contenteditable=true]").length === 1')) return
    await delay(100)
  }
  throw new Error('Timed out waiting for demo editor')
}

async function waitForHistoryMatrix(client) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const result = await evaluate(client, `({
      status: document.body?.dataset.status ?? 'loading',
      summary: document.querySelector('#result')?.textContent ?? '',
    })`)
    if (result.status === 'pass') return result.summary
    if (result.status === 'fail') throw new Error(`History matrix failed: ${result.summary}`)
    await delay(100)
  }
  throw new Error('Timed out waiting for history matrix')
}

async function click(client, selector) {
  const rect = await evaluate(client, `(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(candidate => {
      const rect = candidate.getBoundingClientRect()
      const style = getComputedStyle(candidate)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    })
    if (!element) throw new Error('Missing element: ' + ${JSON.stringify(selector)})
    element.scrollIntoView({ block: 'center', inline: 'center' })
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    return { x, y, hit: hit?.outerHTML?.slice(0, 180) ?? '', hittable: element === hit || element.contains(hit) }
  })()`)
  if (!rect.hittable) throw new Error(`Element is covered for ${selector}: ${JSON.stringify(rect)}`)
  const point = { x: rect.x, y: rect.y }
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
}

async function key(client, { key, code, windowsVirtualKeyCode, modifiers = 0 }) {
  const params = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers }
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
}

async function insertText(client, text) {
  await client.send('Input.insertText', { text })
  await delay(25)
}

async function selectLastBlockText(client) {
  const point = await evaluate(client, `(() => {
    const editable = [...document.querySelectorAll('.oe-block [contenteditable=true]')].at(-1)
    if (!editable?.textContent) throw new Error('Last block has no text')
    const rect = editable.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
  await key(client, { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await delay(100)
}

async function state(client) {
  return evaluate(client, `(() => ({
    blocks: [...document.querySelectorAll('.oe-block')].map(block => ({
      id: block.dataset.blockId,
      html: block.querySelector('[contenteditable=true]')?.innerHTML ?? '',
      text: block.querySelector('[contenteditable=true]')?.textContent ?? '',
    })),
    active: document.activeElement?.outerHTML?.slice(0, 120) ?? '',
  }))()`)
}

function assert(condition, message, details) {
  if (!condition) throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`)
}

async function stopProcess(process) {
  if (!process || process.exitCode !== null) return
  const closed = new Promise(resolve => process.once('close', resolve))
  process.kill()
  await Promise.race([closed, delay(5000)])
}

const vitePort = await freePort()
const debugPort = await freePort()
const pageUrl = `http://127.0.0.1:${vitePort}/tests/browser/physical-history.html`
const userDataDir = await mkdtemp(join(tmpdir(), 'ophire-editor-physical-history-'))
const vite = spawn(process.execPath, [vitePath, '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
  cwd: fileURLToPath(editorRoot),
  stdio: 'ignore',
})

let chrome
let client
try {
  await waitForHttp(pageUrl, vite)
  chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1400,1000',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    pageUrl,
  ], { stdio: 'ignore' })

  const target = await findPageTarget(debugPort, pageUrl, chrome)
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable')
  await waitForEditor(client)

  await click(client, '.oe-block [contenteditable=true]')
  await insertText(client, 'First')
  await key(client, { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await insertText(client, 'Second')
  await key(client, { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await insertText(client, 'Third')

  const beforeBold = await state(client)
  assert(beforeBold.blocks.map(block => block.text).join('|') === 'First|Second|Third', 'Physical typing/split order is wrong', beforeBold)

  await selectLastBlockText(client)
  await click(client, '.oe-inline-tool[data-tool="bold"]')
  await delay(100)
  const afterBold = await state(client)
  assert(afterBold.blocks.length === 3 && /<b>Third<\/b>/i.test(afterBold.blocks[2].html), 'Physical Bold was not applied to the newest block', afterBold)

  await key(client, { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await delay(100)
  const afterUndo = await state(client)
  assert(afterUndo.blocks.length === 3, 'Undo removed a block instead of reverting Bold', afterUndo)
  assert(afterUndo.blocks.map(block => block.text).join('|') === 'First|Second|Third', 'Undo changed block order/content', afterUndo)
  assert(!/<b>/i.test(afterUndo.blocks[2].html), 'Undo did not remove Bold', afterUndo)

  await key(client, { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 | 8 })
  await delay(100)
  const afterRedo = await state(client)
  assert(afterRedo.blocks.length === 3 && /<b>Third<\/b>/i.test(afterRedo.blocks[2].html), 'Redo did not restore Bold on the newest block', afterRedo)

  await selectLastBlockText(client)
  await click(client, '.oe-inline-tool[data-tool="bold"]')
  await delay(100)
  const afterRemoveBold = await state(client)
  assert(!/<b>/i.test(afterRemoveBold.blocks[2].html), 'Second Bold click did not remove formatting', afterRemoveBold)

  await key(client, { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await delay(100)
  const afterUndoRemoval = await state(client)
  assert(afterUndoRemoval.blocks.length === 3 && /<b>Third<\/b>/i.test(afterUndoRemoval.blocks[2].html), 'Undo did not restore removed Bold', afterUndoRemoval)

  // Repeat the failure report literally: add blocks through the visible `+`
  // toolbox, format the newest block, and undo immediately without allowing
  // a debounce interval to hide an event-ordering bug.
  await client.send('Page.reload', { ignoreCache: true })
  await delay(300)
  await waitForEditor(client)
  await click(client, '.oe-block [contenteditable=true]')
  await insertText(client, 'Base')

  await click(client, '.oe-toolbar > button:first-child')
  await click(client, '.oe-toolbox__item[data-plugin-type="paragraph"]')
  await insertText(client, 'AddedOne')
  await click(client, '.oe-toolbar > button:first-child')
  await click(client, '.oe-toolbox__item[data-plugin-type="paragraph"]')
  await insertText(client, 'AddedTwo')

  const toolboxBeforeBold = await state(client)
  assert(toolboxBeforeBold.blocks.map(block => block.text).join('|') === 'Base|AddedOne|AddedTwo', 'Physical toolbox insertion order is wrong', toolboxBeforeBold)
  const toolboxIds = toolboxBeforeBold.blocks.map(block => block.id)

  await selectLastBlockText(client)
  await click(client, '.oe-inline-tool[data-tool="bold"]')
  await key(client, { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await delay(100)
  const toolboxAfterImmediateUndo = await state(client)
  assert(toolboxAfterImmediateUndo.blocks.length === 3, 'Immediate Undo after Bold removed a toolbox-inserted block', toolboxAfterImmediateUndo)
  assert(toolboxAfterImmediateUndo.blocks.map(block => block.id).join('|') === toolboxIds.join('|'), 'Immediate Undo changed toolbox block identity/order', toolboxAfterImmediateUndo)
  assert(toolboxAfterImmediateUndo.blocks.map(block => block.text).join('|') === 'Base|AddedOne|AddedTwo', 'Immediate Undo changed toolbox block content/order', toolboxAfterImmediateUndo)
  assert(!/<b>/i.test(toolboxAfterImmediateUndo.blocks[2].html), 'Immediate Undo did not remove Bold from toolbox-inserted block', toolboxAfterImmediateUndo)

  // Delete through the real block-settings UI and undo before the removal
  // animation finishes. Model/DOM identity must remain in exact LIFO order.
  await click(client, '.oe-toolbar > button:nth-child(2)')
  await click(client, '.oe-settings-menu__item--danger')
  await key(client, { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await delay(100)
  const deleteLastImmediateUndo = await state(client)
  assert(deleteLastImmediateUndo.blocks.map(block => block.id).join('|') === toolboxIds.join('|'), 'Immediate Undo of last-block deletion changed ID/order', deleteLastImmediateUndo)
  assert(/contenteditable="true"/i.test(deleteLastImmediateUndo.active), 'Focus escaped the editor after immediate deletion Undo', deleteLastImmediateUndo)

  await key(client, { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 | 8 })
  await delay(450)
  const deleteLastRedo = await state(client)
  assert(deleteLastRedo.blocks.map(block => block.id).join('|') === toolboxIds.slice(0, 2).join('|'), 'Redo deleted the wrong block', deleteLastRedo)
  assert(/contenteditable="true"/i.test(deleteLastRedo.active), 'Focus escaped the editor after deletion Redo', deleteLastRedo)

  await key(client, { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await delay(100)
  const deleteLastUndoAgain = await state(client)
  assert(deleteLastUndoAgain.blocks.map(block => block.id).join('|') === toolboxIds.join('|'), 'Second Undo did not restore the last block in place', deleteLastUndoAgain)

  await click(client, '.oe-block:nth-child(2) [contenteditable=true]')
  await click(client, '.oe-toolbar > button:nth-child(2)')
  await click(client, '.oe-settings-menu__item--danger')
  await delay(450)
  const deleteMiddle = await state(client)
  assert(deleteMiddle.blocks.map(block => block.id).join('|') === [toolboxIds[0], toolboxIds[2]].join('|'), 'Settings deletion removed the wrong middle block', deleteMiddle)

  await key(client, { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await delay(100)
  const deleteMiddleUndo = await state(client)
  assert(deleteMiddleUndo.blocks.map(block => block.id).join('|') === toolboxIds.join('|'), 'Undo restored the middle block in the wrong order', deleteMiddleUndo)
  assert(/contenteditable="true"/i.test(deleteMiddleUndo.active), 'Focus escaped the editor after middle-block Undo', deleteMiddleUndo)

  // The next inline command after a structural restore must become the newest
  // history entry; undoing it may not remove any restored block.
  await selectLastBlockText(client)
  await click(client, '.oe-inline-tool[data-tool="italic"]')
  await key(client, { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
  await delay(100)
  const inlineAfterDeleteUndo = await state(client)
  assert(inlineAfterDeleteUndo.blocks.map(block => block.id).join('|') === toolboxIds.join('|'), 'Inline Undo after structural restore removed/reordered a block', inlineAfterDeleteUndo)
  assert(!/<i>/i.test(inlineAfterDeleteUndo.blocks[2].html), 'Inline Undo after structural restore did not remove Italic', inlineAfterDeleteUndo)
  assert(/contenteditable="true"/i.test(inlineAfterDeleteUndo.active), 'Focus escaped after inline Undo on a restored document', inlineAfterDeleteUndo)

  const historyUrl = new URL('/tests/browser/history.html', pageUrl).href
  await client.send('Page.navigate', { url: historyUrl })
  const historyMatrix = await waitForHistoryMatrix(client)

  // Real browser insertion must cover beforeinput paths without a keydown.
  // The page builds its range through MouseSelectionManager; CDP types into it.
  await client.send('Runtime.addBinding', { name: '__rectorTestInput' })
  client.on('Runtime.bindingCalled', ({ name, payload }) => {
    if (name !== '__rectorTestInput') return
    const request = JSON.parse(payload)
    const respond = (ok, result) => evaluate(client,
      `window.__resolveTestInput(${JSON.stringify(request.id)}, ${ok}, ${JSON.stringify(result)})`)
    const allowed = ['Input.dispatchKeyEvent', 'Input.insertText']
    const operation = allowed.includes(request.method)
      ? client.send(request.method, request.params)
      : Promise.reject(new Error('Unsupported fixture input method'))
    void operation.then(result => respond(true, result), error => respond(false, String(error)))
      .catch(error => console.error('Native input fixture failed:', error))
  })
  await client.send('Page.navigate', { url: new URL('/tests/browser/native-text-input.html', pageUrl).href })
  // Wait for navigation rather than accepting the previous page's pass marker.
  const nativeDeadline = Date.now() + 20_000
  while (!await evaluate(client, 'typeof window.__resolveTestInput === "function"')) {
    if (Date.now() > nativeDeadline) throw new Error('Timed out loading native input fixture')
    await delay(50)
  }
  const nativeTextInput = JSON.parse(await waitForHistoryMatrix(client))

  console.log(JSON.stringify({
    enterScenario: { beforeBold, afterBold, afterUndo, afterRedo, afterRemoveBold, afterUndoRemoval },
    toolboxScenario: {
      toolboxBeforeBold,
      toolboxAfterImmediateUndo,
      deleteLastImmediateUndo,
      deleteLastRedo,
      deleteLastUndoAgain,
      deleteMiddle,
      deleteMiddleUndo,
      inlineAfterDeleteUndo,
    },
    historyMatrix: JSON.parse(historyMatrix),
    nativeTextInput,
  }))
} finally {
  client?.close()
  await Promise.all([stopProcess(chrome), stopProcess(vite)])
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
