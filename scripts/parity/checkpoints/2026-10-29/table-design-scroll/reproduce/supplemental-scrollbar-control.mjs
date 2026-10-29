import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { editorRoot, vitePath, findChrome } from '/tmp/rector-completion-integration-20261029/tests/browser/environment.mjs'
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

const pendingNativeInput = new Set()
let nativeInputError = null

async function waitForNativeInput() {
  while (pendingNativeInput.size) await Promise.all([...pendingNativeInput])
  if (nativeInputError) throw nativeInputError
}

async function waitForHistoryMatrix(client) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const result = await evaluate(client, `({
      status: document.body?.dataset.status ?? 'loading',
      summary: document.querySelector('#result')?.textContent ?? '',
    })`)
    if (result.status === 'pass') {
      await waitForNativeInput()
      return result.summary
    }
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

async function installNativeInput(client) {
  await client.send('Runtime.addBinding', { name: '__rectorTestInput' })
  client.on('Runtime.bindingCalled', ({ name, payload }) => {
    if (name !== '__rectorTestInput') return
    const request = JSON.parse(payload)
    const respond = (ok, result) => evaluate(client,
      `window.__resolveTestInput(${JSON.stringify(request.id)}, ${ok}, ${JSON.stringify(result)})`)
    const allowed = ['Input.dispatchKeyEvent', 'Input.insertText', 'Input.imeSetComposition']
    const operation = request.method === 'Input.click'
      ? (async () => {
          await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...request.params })
          await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...request.params, button: 'left', buttons: 1, clickCount: 1 })
          await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...request.params, button: 'left', buttons: 0, clickCount: 1 })
        })()
      : request.method === 'Input.drag'
      ? (async () => {
          const { from, to, via = [] } = request.params
          await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...from })
          await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', buttons: 1, clickCount: 1 })
          let previous = from
          for (const next of [...via, to]) {
            for (let step = 1; step <= 10; step++) {
              await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: previous.x + (next.x - previous.x) * step / 10, y: previous.y + (next.y - previous.y) * step / 10, button: 'left', buttons: 1 })
            }
            previous = next
          }
          await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', buttons: 0, clickCount: 1 })
        })()
      : request.method === 'Input.hover'
      ? client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...request.params })
      : request.method === 'Viewport.set'
      ? client.send('Emulation.setDeviceMetricsOverride', { ...request.params, deviceScaleFactor: 1, mobile: false })
      : request.method === 'Viewport.reset'
      ? client.send('Emulation.clearDeviceMetricsOverride')
      : allowed.includes(request.method)
      ? client.send(request.method, request.params)
      : Promise.reject(new Error('Unsupported fixture input method'))
    const pending = operation.then(result => respond(true, result), error => respond(false, String(error)))
      .catch(error => { nativeInputError = error })
      .finally(() => pendingNativeInput.delete(pending))
    pendingNativeInput.add(pending)
  })
}

async function runNativePage(client, pageUrl, page) {
  const url = new URL(`/tests/browser/${page}`, pageUrl)
  if (process.env.EDITOR_NATIVE_FILTER) url.searchParams.set('test-filter', process.env.EDITOR_NATIVE_FILTER)
  await client.send('Page.navigate', { url: url.href })
  const deadline = Date.now() + 20_000
  while (!await evaluate(client, `location.pathname.endsWith(${JSON.stringify('/' + page)}) && typeof window.__resolveTestInput === "function"`)) {
    if (Date.now() > deadline) throw new Error(`Timed out loading ${page}`)
    await delay(50)
  }
  const results = JSON.parse(await waitForHistoryMatrix(client))
  assert(Array.isArray(results) && results.length > 0, `No native cases ran for ${page}`)
  console.log(`Native ${page}: ${results.length} passed`)
  return results
}



const vitePort = await freePort()
const debugPort = await freePort()
const pageUrl = `http://127.0.0.1:${vitePort}/tests/browser/native-plugin-design.html?visual`
const userDataDir = await mkdtemp(join(tmpdir(), 'rector-table-design-probe-'))
const vite = spawn(process.execPath, [vitePath, '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: fileURLToPath(editorRoot), stdio: 'ignore' })
let chrome, client
try {
  await waitForHttp(pageUrl, vite)
  chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--window-size=1400,1000', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`, pageUrl], {stdio:'ignore'})
  const target = await findPageTarget(debugPort,pageUrl,chrome)
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable')
  await installNativeInput(client)
  const deadline=Date.now()+20000
  while(!await evaluate(client, `Boolean(document.querySelector('#visual-controls select[name="Plugin"]'))`)) {if(Date.now()>deadline) throw new Error('Visual controls missing'); await delay(50)}
  await evaluate(client, `(() => {document.querySelector('#visual-controls').hidden=true;document.querySelector('#visual-grid').hidden=true;window.__probeErrors=[];addEventListener('error',event=>__probeErrors.push(String(event.error??event.message)));addEventListener('unhandledrejection',event=>__probeErrors.push(String(event.reason)))})()`)
  const result=[]
  for(const width of [640,288]) for(const theme of ['light','dark']) for(const state of ['filled','empty','readOnly','emptyReadOnly']) {
    await client.send('Emulation.setDeviceMetricsOverride', {width:width+40,height:1000,deviceScaleFactor:1,mobile:false})
    result.push(await evaluate(client, `(async()=>{
      const {make,editorHolder,blockElement,assert,equal}=await import('/tests/browser/regressions/harness.js')
      const {clickNative,printable,dispatchKey,waitForStyles}=await import('/tests/browser/native-input-helpers.js')
      const {getTextOffset}=await import('/shared/textOffset.js')
      const {pluginParityFixtures}=await import('/tests/browser/plugin-parity-fixtures.js')
      const {createParagraphPlugin}=await import('/plugins/index.js')
      const {default:en}=await import('/locale/en.js')
      const fixture=pluginParityFixtures.find(f=>f.name==='Table'),definition=fixture.factory(),state=${JSON.stringify(state)}
      const editor=make([{id:'a',type:definition.type,dataVersion:definition.schema.currentVersion,data:state.startsWith('empty')?definition.schema.createDefault():fixture.data}],{injectStyles:true,theme:${JSON.stringify(theme)},locale:en,readOnly:state==='readOnly'||state==='emptyReadOnly',plugins:[createParagraphPlugin(),definition]})
      const holder=editorHolder(editor);holder.style.width=${JSON.stringify(width+'px')};holder.style.maxWidth='100%';holder.style.background=${JSON.stringify(theme==='light'?'#fff':'#0d0d0d')}
      try{
        await waitForStyles(document)
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
        const block=blockElement(editor,'a'),wrapper=block.querySelector('.oe-table-wrapper')
        const rect=x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom,height:r.height}}
        const cells=[...wrapper.querySelectorAll('.oe-table__cell')],original=editor.save().blocks
        const before={block:rect(block),blockScrollWidth:block.scrollWidth,wrapper:rect(wrapper),clientWidth:wrapper.clientWidth,scrollWidth:wrapper.scrollWidth,overflowX:getComputedStyle(wrapper).overflowX,scrollLeft:wrapper.scrollLeft,cells:cells.map(cell=>({rect:rect(cell),visibility:cell.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),editable:cell.contentEditable}))}
        assert(block.scrollWidth<=Math.ceil(block.getBoundingClientRect().width)+1,'Actual outer block overflow')
        const reachable=[]
        for(const cell of cells){
          cell.scrollIntoView({block:'nearest',inline:'nearest'})
          const r=cell.getBoundingClientRect(),w=wrapper.getBoundingClientRect(),b=block.getBoundingClientRect()
          const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2,hit=document.elementFromPoint(x,y)
          const entry={scrollLeft:wrapper.scrollLeft,cell:rect(cell),wrapper:rect(wrapper),block:rect(block),hittable:hit===cell||cell.contains(hit),contained:r.left>=w.left-1&&r.right<=w.right+1,blockOverflow:block.scrollWidth>Math.ceil(b.width)+1}
          assert(entry.hittable&&entry.contained&&!entry.blockOverflow,'Cell is not reachable inside the declared table scroller: '+JSON.stringify(entry))
          reachable.push(entry)
        }
        equal(editor.save().blocks,original,'Geometry/scroll changed canonical data');equal(editor.canUndo,false)
        wrapper.scrollLeft=0
        const originalOverflow=wrapper.style.overflowX
        wrapper.style.overflowX='visible'
        const escaped={wrapperOverflow:getComputedStyle(wrapper).overflowX,blockWidth:block.getBoundingClientRect().width,blockScrollWidth:block.scrollWidth}
        wrapper.style.overflowX=originalOverflow
        let authoring=null
        if(state==='filled'||state==='empty'){
          const last=cells.at(-1),oldText=original[0].data.rows.at(-1).cells.at(-1).text
          await clickNative(last);await dispatchKey('End','End',35)
          equal(document.activeElement,last,'Trusted click did not focus last cell')
          const caret=()=>{const s=getSelection();return {inside:last.contains(s.focusNode),offset:getTextOffset(last,s.focusNode,s.focusOffset)}}
          const beforeCaret=caret();equal(beforeCaret,{inside:true,offset:oldText.length})
          await printable('X')
          const expected=structuredClone(original);expected[0].data.rows.at(-1).cells.at(-1).text=oldText+'X'
          equal(editor.save().blocks,expected,'Last-cell native input changed another cell or identity')
          const afterCaret=caret();equal(afterCaret,{inside:true,offset:oldText.length+1});equal(editor.canUndo,true);equal(editor.canRedo,false)
          await dispatchKey('z','KeyZ',90,2)
          equal(editor.save().blocks,original,'One native Undo did not restore exact table');equal(editor.canUndo,false);equal(editor.canRedo,true)
          const undoCaret=caret();equal(undoCaret,{inside:true,offset:oldText.length})
          await dispatchKey('z','KeyZ',90,10)
          equal(editor.save().blocks,expected,'One native Redo did not restore exact input');equal(editor.canUndo,true);equal(editor.canRedo,false)
          const redoCaret=caret();equal(redoCaret,{inside:true,offset:oldText.length+1})
          assert(blockElement(editor,'a').querySelectorAll('.oe-table__cell')[cells.length-1]===last,'Replay replaced last-cell host')
          authoring={trustedClick:true,nativePrintable:'X',beforeCaret,afterCaret,undoCaret,redoCaret,exactCanonicalAndHistory:true,lastHostPreserved:true}
        }
        return {width:${width},theme:${JSON.stringify(theme)},state,before,reachable,escapedControl:escaped,authoring}
      }finally{editor.destroy();holder.remove()}
    })()`))
  }
  const errors=await evaluate(client,'window.__probeErrors')
  if(errors.length)throw new Error('Unexpected browser errors: '+JSON.stringify(errors))
  console.log(JSON.stringify({source:'c653697659e58992bc016f8ee9e8f1100e94b8fe',chrome:await client.send('Browser.getVersion'),cases:result,unexpectedErrors:errors}))
} finally {
  client?.close()
  await stopProcess(chrome)
  await stopProcess(vite)
  await rm(userDataDir,{recursive:true,force:true})
}
