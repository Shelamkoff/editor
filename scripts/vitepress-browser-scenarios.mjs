import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const distRoot = join(root, 'docs', '.vitepress', 'dist')
const configuredBase = process.env.DOCS_BASE ?? '/'
const siteBase = configuredBase === '/'
  ? '/'
  : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`
const chromePath = process.env.EDITOR_CHROME_PATH
  ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const expectedBlockTypes = [
  'paragraph', 'heading', 'list', 'quote', 'code', 'image', 'embed', 'gallery',
  'carousel', 'checklist', 'warning', 'raw', 'poll', 'person', 'attaches',
  'linkPreview', 'toggle', 'columns', 'spoiler', 'delimiter', 'table',
]
const qaRoot = process.env.RECTOR_QA_DIR ? resolve(process.env.RECTOR_QA_DIR) : null
const externalPageUrl = process.env.RECTOR_DOCS_URL?.trim() || null
const missingRequests = []

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
  })
}

function startStaticServer() {
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  }
  return createHttpServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
      const sitePath = siteBase === '/'
        ? pathname
        : pathname === siteBase.slice(0, -1)
          ? '/'
          : pathname.startsWith(siteBase)
            ? `/${pathname.slice(siteBase.length)}`
            : null
      if (sitePath === null) throw new Error('Path is outside the configured site base')
      const relativePath = sitePath === '/'
        ? 'index.html'
        : sitePath.endsWith('/')
          ? `${sitePath.slice(1)}index.html`
          : extname(sitePath)
            ? sitePath.slice(1)
            : `${sitePath.slice(1)}.html`
      const file = resolve(distRoot, relativePath)
      if (file !== distRoot && !file.startsWith(`${distRoot}${sep}`)) throw new Error('Invalid path')
      const body = await readFile(file)
      response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' })
      response.end(body)
    } catch {
      missingRequests.push(request.url ?? '/')
      response.writeHead(404)
      response.end('Not found')
    }
  })
}

async function findPageTarget(debugPort, pageUrl, chrome) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = response.ok ? await response.json() : []
      const target = targets.find(item => item.type === 'page' && item.url.startsWith(pageUrl))
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
      if (!message.id) return
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
      this.#pending.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
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

async function captureScreenshot(client, file) {
  await client.send('Page.enable')
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  await writeFile(file, Buffer.from(data, 'base64'))
}

async function waitForHydratedDemo(client) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const status = await evaluate(client, `({
      ready: Boolean(document.querySelector('.live-demo .oe-editor .oe-block')),
      error: document.querySelector('.ld-error')?.textContent ?? '',
    })`)
    if (status.error) throw new Error(`VitePress demo failed: ${status.error}`)
    if (status.ready) return
    await delay(100)
  }
  throw new Error('Timed out waiting for the VitePress demo to hydrate')
}

async function verifyHeadingLevelMenu(client, language, theme) {
  await evaluate(client, "document.querySelector('.live-demo .oe-inline-toolbar__level-select').focus()")
  const key = { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 }
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  await delay(100)
  const menu = await evaluate(client, `(() => {
    const trigger = document.querySelector('.live-demo .oe-inline-toolbar__level-select')
    const menu = document.querySelector('.live-demo .oe-inline-toolbar__level-dropdown')
    const rect = menu.getBoundingClientRect()
    const toolbar = document.querySelector('.live-demo .oe-inline-toolbar').getBoundingClientRect()
    const options = [...menu.querySelectorAll('[role="menuitemradio"]')]
    return {
      label: trigger.getAttribute('aria-label'), expanded: trigger.getAttribute('aria-expanded'),
      chevronHeight: trigger.querySelector('svg')?.getBoundingClientRect().height,
      focused: document.activeElement?.dataset.level,
      levels: options.map(option => option.dataset.level),
      selected: options.filter(option => option.getAttribute('aria-checked') === 'true').map(option => option.dataset.level),
      withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      selectionPreserved: !window.getSelection().isCollapsed,
      outsideToolbar: rect.top >= toolbar.bottom + 3 || rect.bottom <= toolbar.top - 3,
    }
  })()`)
  const label = language === 'ru' ? 'Уровень заголовка' : 'Heading level'
  assert(menu.label === label && menu.expanded === 'true' && menu.focused === '6', 'Heading menu keyboard/name regression: ' + JSON.stringify(menu))
  assert(JSON.stringify(menu.levels) === JSON.stringify(['2', '3', '4', '5', '6']) && JSON.stringify(menu.selected) === JSON.stringify(['2']), 'Heading option state regression: ' + JSON.stringify(menu))
  assert(menu.chevronHeight === 12 && menu.withinViewport && menu.selectionPreserved && menu.outsideToolbar, 'Heading menu layout/selection regression: ' + JSON.stringify(menu))
  if (qaRoot) await captureScreenshot(client, join(qaRoot, 'heading-' + language + '-' + theme + '.png'))
  const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...escape })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...escape })
  assert(await evaluate(client, "document.querySelector('.live-demo .oe-inline-toolbar__level-select').getAttribute('aria-expanded') === 'false'"), 'Escape did not close Heading levels')
}

async function verifyTypeMenu(client, language, theme) {
  const selected = await evaluate(client, 'window.getSelection().toString()')
  const target = await evaluate(client, `(() => {
    const rect = document.querySelector('.live-demo .oe-inline-toolbar__type-select').getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...target })
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...target })
  await delay(100)
  const layout = await evaluate(client, `(() => {
    const menu = document.querySelector('.live-demo .oe-inline-toolbar__type-dropdown')
    const rect = menu.getBoundingClientRect()
    const toolbar = document.querySelector('.live-demo .oe-inline-toolbar').getBoundingClientRect()
    return {
      plugins: menu.querySelectorAll('[role=menuitem]').length,
      outsideToolbar: rect.top >= toolbar.bottom + 3 || rect.bottom <= toolbar.top - 3,
      bounded: rect.left >= 7 && rect.right <= innerWidth - 7 && rect.top >= 7 && rect.bottom <= innerHeight - 7,
      noOverflow: menu.scrollWidth <= menu.clientWidth + 1,
    }
  })()`)
  assert(layout.plugins === 21 && layout.outsideToolbar && layout.bounded && layout.noOverflow, 'Conversion menu geometry regression: ' + JSON.stringify(layout))
  if (qaRoot) await captureScreenshot(client, join(qaRoot, 'conversion-' + language + '-' + theme + '.png'))
  await evaluate(client, "document.querySelector('.live-demo .oe-inline-toolbar__type-filter-input').focus()")
  await client.send('Input.insertText', { text: language === 'ru' ? 'Заголовок' : 'Heading' })
  await delay(60)
  assert(await evaluate(client, `[...document.querySelectorAll('.live-demo .oe-inline-toolbar__type-item')].filter(item => item.style.display !== 'none').map(item => item.dataset.pluginType).join(',') === 'heading'`), 'Conversion filter lost Heading')
  const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...escape })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...escape })
  await delay(100)
  assert(await evaluate(client, "document.querySelector('.live-demo .oe-inline-toolbar__type-select').getAttribute('aria-expanded') === 'false'"), 'Escape did not close conversion menu')
  assert(await evaluate(client, 'window.getSelection().toString()') === selected, 'Escape after conversion filter lost the selected text')
}

async function verifyAlignmentSelection(client, language) {
  async function click(selector) {
    const point = await evaluate(client, `(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      const rect = element.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`)
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
    await delay(60)
  }
  const center = language === 'ru' ? 'По центру' : 'Align center'
  const left = language === 'ru' ? 'По левому краю' : 'Align left'
  await click('.live-demo .oe-inline-tool[data-tool="align"]')
  await click('.live-demo .oe-inline-toolbar__align-panel [aria-label="' + center + '"]')
  const centered = await evaluate(client, `(() => {
    const button = document.querySelector('.live-demo .oe-inline-tool[data-tool="align"]')
    return { label: button.getAttribute('aria-label'), icon: button.innerHTML }
  })()`)
  assert(centered.label === center, 'Demo did not apply centered alignment')
  await evaluate(client, `(() => {
    const field = document.querySelector('.live-demo .oe-block[data-block-type="paragraph"] [contenteditable="true"]')
    field.scrollIntoView({ block: 'center' })
    field.focus({ preventScroll: true })
    const range = document.createRange()
    range.selectNodeContents(field)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })()`)
  await delay(100)
  const current = await evaluate(client, `(() => {
    const button = document.querySelector('.live-demo .oe-inline-tool[data-tool="align"]')
    return { label: button.getAttribute('aria-label'), icon: button.innerHTML, active: button.classList.contains('oe-inline-tool--active') }
  })()`)
  assert(current.label === left && !current.active && current.icon !== centered.icon, 'Alignment state did not follow the selected demo block: ' + JSON.stringify(current))
  const undo = { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 }
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...undo })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...undo })
  await delay(100)
  assert(await evaluate(client, "document.querySelector('.live-demo .oe-block[data-block-type=heading]').style.textAlign === ''"), 'Demo alignment did not undo in one action')
  await evaluate(client, "document.querySelector('.live-demo .oe-inline-toolbar__level-select').focus()")
}

async function verifyBlockOperations(client, language) {
  async function click(expression) {
    const point = await evaluate(client, `(() => {
      const element = (${expression})
      if (!element) throw new Error('Missing demo action')
      element.scrollIntoView({ block: 'nearest' })
      const rect = element.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`)
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
    await delay(80)
  }
  async function undo(redo = false) {
    const key = { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: redo ? 10 : 2 }
    await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    await delay(300)
  }
  const snapshot = () => evaluate(client, `[...document.querySelectorAll('.live-demo .oe-block')].map(block => ({
    id: block.dataset.blockId, type: block.dataset.blockType,
    fields: [...block.querySelectorAll('[contenteditable="true"],textarea')].map(field => field.value ?? field.textContent),
  }))`)
  await evaluate(client, `(() => {
    const field = document.querySelector('.live-demo .oe-block [contenteditable="true"]')
    field.scrollIntoView({ block: 'center' })
    field.focus({ preventScroll: true })
    const range = document.createRange()
    range.setStart(field.firstChild, 0)
    range.collapse(true)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })()`)
  await delay(100)
  const before = await snapshot()
  const tune = 'document.querySelector(".live-demo .oe-toolbar__drag")'
  await click(tune)
  const down = language === 'ru' ? 'Переместить вниз' : 'Move down'
  const action = label => `[...document.querySelectorAll('.live-demo .oe-settings-menu__item')].find(item => item.querySelector('.oe-settings-menu__label')?.textContent === ${JSON.stringify(label)})`
  await click(action(down))
  await delay(300)
  const moved = await snapshot()
  assert(moved[1].id === before[0].id && moved[0].id === before[1].id, 'Demo Move down did not reorder blocks')
  const geometry = await evaluate(client, `(() => {
    const block = document.querySelector('.live-demo .oe-block[data-block-id="' + ${JSON.stringify(before[0].id)} + '"]').getBoundingClientRect()
    const toolbar = document.querySelector('.live-demo .oe-toolbar').getBoundingClientRect()
    return { delta: Math.abs(block.top - toolbar.top), right: toolbar.left >= block.right - 1 }
  })()`)
  assert(geometry.delta <= 2 && geometry.right, 'Demo moved buttons are detached: ' + JSON.stringify(geometry))
  if (qaRoot) await captureScreenshot(client, join(qaRoot, 'moved-buttons-' + language + '.png'))
  const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
  await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...escape })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...escape })
  await undo()
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Demo move did not undo exactly')
  await evaluate(client, `(() => {
    const field = document.querySelector('.live-demo .oe-block [contenteditable="true"]')
    field.scrollIntoView({ block: 'center' })
    field.focus({ preventScroll: true })
    const range = document.createRange()
    range.setStart(field.firstChild, 2)
    range.setEnd(field.firstChild, 5)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })()`)
  await delay(100)
  await click(tune)
  await click(action(language === 'ru' ? 'Преобразовать в' : 'Convert to'))
  await click('document.querySelector(".live-demo .oe-settings-menu [data-plugin-type=paragraph]")')
  await delay(300)
  const after = await snapshot()
  const text = before[0].fields[0]
  assert(after.length === before.length + 2, 'Demo selected fragment did not split its owner')
  assert(JSON.stringify(after.slice(0, 3).map(block => [block.type, block.fields[0]])) === JSON.stringify([
    ['heading', text.slice(0, 2)], ['paragraph', text.slice(2, 5)], ['heading', text.slice(5)],
  ]), 'Demo tune transformed unselected title text: ' + JSON.stringify(after.slice(0, 3)))
  assert(JSON.stringify(after.slice(3)) === JSON.stringify(before.slice(1)), 'Demo conversion changed other blocks')
  if (qaRoot) await captureScreenshot(client, join(qaRoot, 'tune-fragment-' + language + '.png'))
  await undo()
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), 'Demo fragment did not undo in one action')
  await undo(true)
  assert(JSON.stringify(await snapshot()) === JSON.stringify(after), 'Demo fragment redo changed author data or identity')
  await undo()
  const crossBefore = await snapshot()
  const points = await evaluate(client, `(() => {
    const paragraph = document.querySelector('.live-demo .oe-block[data-block-type="paragraph"] [contenteditable="true"]')
    const list = document.querySelector('.live-demo .oe-block[data-block-type="list"]')
    const second = list.querySelectorAll('[contenteditable="true"]')[1]
    paragraph.scrollIntoView({ block: 'center' })
    function point(element, atEnd) {
      const range = document.createRange()
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)
      const node = atEnd ? nodes.at(-1) : nodes[0]
      if (!node) throw new Error('Demo text endpoint is empty')
      range.setStart(node, atEnd ? node.textContent.length : 2)
      range.collapse(true)
      const rect = range.getBoundingClientRect()
      if (!rect.height) throw new Error('Demo cross-selection caret has no geometry')
      return { x: rect.left + 0.1, y: rect.top + rect.height / 2 }
    }
    return { from: point(paragraph, false), to: point(second, true) }
  })()`)
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points.from })
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...points.from })
  for (let step = 1; step <= 12; step++) {
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
      x: points.from.x + (points.to.x - points.from.x) * step / 12,
      y: points.from.y + (points.to.y - points.from.y) * step / 12,
    })
  }
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...points.to })
  await delay(100)
  assert(await evaluate(client, "document.querySelector('.live-demo .oe-editor').classList.contains('oe-editor--cross-selecting')"), 'Demo cross selection was lost')
  await click('document.querySelector(".live-demo .oe-inline-toolbar__type-select")')
  await click('document.querySelector(".live-demo .oe-inline-toolbar__type-dropdown [data-plugin-type=image]")')
  await delay(300)
  assert(await evaluate(client, "(!window.getSelection().rangeCount || window.getSelection().isCollapsed) && !document.querySelector('.live-demo .oe-editor').classList.contains('oe-editor--cross-selecting') && document.querySelector('.live-demo .oe-inline-toolbar').style.display === 'none'"), 'Demo Image conversion retained an obsolete selection/toolbar')
  const crossAfter = await snapshot()
  const paragraphIndex = crossBefore.findIndex(block => block.type === 'paragraph')
  const listIndex = crossBefore.findIndex(block => block.type === 'list')
  assert(listIndex === paragraphIndex + 1, 'Demo fixture changed Paragraph/List order')
  assert(crossAfter.filter(block => block.type === 'image').length === 1, 'Demo cross conversion duplicated Image')
  assert(crossAfter[paragraphIndex].fields[0] === crossBefore[paragraphIndex].fields[0].slice(0, 2), 'Demo Image conversion changed the unselected prefix')
  assert(JSON.stringify(crossAfter[paragraphIndex + 2]) === JSON.stringify({ ...crossBefore[listIndex], fields: crossBefore[listIndex].fields.slice(2) }), 'Demo Image conversion changed unselected List item')
  assert(JSON.stringify(crossAfter.slice(paragraphIndex + 3)) === JSON.stringify(crossBefore.slice(listIndex + 1)), 'Demo Image conversion changed other blocks')
  if (qaRoot) await captureScreenshot(client, join(qaRoot, 'cross-image-' + language + '.png'))
  await undo()
  assert(JSON.stringify(await snapshot()) === JSON.stringify(crossBefore), 'Demo cross Image did not undo exactly')
  await undo(true)
  assert(JSON.stringify(await snapshot()) === JSON.stringify(crossAfter), 'Demo cross Image redo changed data or identity')
  await undo()
}

async function verifyDemoTooltips(client, language) {
  const labels = await evaluate(client, `Object.fromEntries(
    [...document.querySelectorAll('.live-demo .oe-inline-tool[data-tool]')]
      .map(button => [button.dataset.tool, button.getAttribute('aria-label') || button.title])
  )`)
  const expected = language === 'ru'
    ? { bold: 'Полужирный', italic: 'Курсив', strikethrough: 'Зачёркнутый', link: 'Ссылка', code: 'Внутристрочный код', marker: 'Маркер', bgcolor: 'Фон текста', fontSize: 'Размер шрифта', script: 'Надстрочный', align: 'По левому краю', caseTransform: 'Сменить регистр', clearFormatting: 'Очистить форматирование' }
    : { bold: 'Bold', italic: 'Italic', strikethrough: 'Strikethrough', link: 'Link', code: 'Inline Code', marker: 'Highlight', bgcolor: 'Background', fontSize: 'Font size', script: 'Superscript', align: 'Align left', caseTransform: 'Toggle case', clearFormatting: 'Clear formatting' }
  for (const [type, label] of Object.entries(expected)) {
    assert(labels[type] === label, `${language} demo label for ${type}: ${labels[type]} instead of ${label}`)
  }
  const initiallyDark = await evaluate(client, "document.documentElement.classList.contains('dark')")
  for (const theme of ['light', 'dark']) {
    await evaluate(client, `(() => {
      if (document.documentElement.classList.contains('dark') !== ${theme === 'dark'}) document.querySelector('.VPSwitchAppearance').click()
      const field = document.querySelector('.live-demo [contenteditable="true"]')
      field.scrollIntoView({ block: 'center' })
      field.focus({ preventScroll: true })
      const range = document.createRange()
      range.selectNodeContents(field)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })()`)
    await delay(150)
    for (const [type, shortcut] of [['strikethrough', 'Ctrl+Shift+S'], ['link', 'Ctrl+K']]) {
      const target = await evaluate(client, `(() => {
        const rect = document.querySelector('.live-demo .oe-inline-tool[data-tool="${type}"]').getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      })()`)
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target })
      await delay(600)
      const tooltip = await evaluate(client, `(() => {
        const button = document.querySelector('.live-demo .oe-inline-tool[data-tool="${type}"]')
        const tooltip = document.getElementById(button.getAttribute('aria-describedby'))
        if (!tooltip) return null
        const rect = tooltip.getBoundingClientRect()
        const style = getComputedStyle(tooltip)
        return {
          label: tooltip.querySelector('.oe-tooltip__label')?.textContent,
          shortcut: tooltip.querySelector('.oe-tooltip__shortcut')?.textContent,
          display: style.display, background: style.backgroundColor, borderRadius: style.borderRadius,
          withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
          selected: !window.getSelection().isCollapsed,
        }
      })()`)
      assert(tooltip?.label === expected[type] && tooltip?.shortcut === shortcut && tooltip?.display !== 'none', `${language}/${theme} styled tooltip: ${JSON.stringify(tooltip)}`)
      assert(tooltip.withinViewport && tooltip.selected && tooltip.borderRadius === '6px', 'Tooltip layout or selection regressed')
      if (qaRoot && type === 'strikethrough') {
        await mkdir(qaRoot, { recursive: true })
        await captureScreenshot(client, join(qaRoot, `tooltip-${language}-${theme}.png`))
      }
    }
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
    await verifyHeadingLevelMenu(client, language, theme)
    await verifyTypeMenu(client, language, theme)
  }
  await verifyAlignmentSelection(client, language)
  await verifyBlockOperations(client, language)
  await evaluate(client, `(() => {
    if (document.documentElement.classList.contains('dark') !== ${initiallyDark}) document.querySelector('.VPSwitchAppearance').click()
  })()`)
  await delay(100)
}

async function stopProcess(process) {
  if (!process || process.exitCode !== null) return
  const closed = new Promise(resolve => process.once('close', resolve))
  process.kill()
  await Promise.race([closed, delay(5000)])
}

const debugPort = await freePort()
const profile = await mkdtemp(join(tmpdir(), 'rector-vitepress-'))
const staticServer = externalPageUrl ? null : startStaticServer()
if (staticServer) {
  await new Promise((resolve, reject) => {
    staticServer.once('error', reject)
    staticServer.listen(0, '127.0.0.1', resolve)
  })
}
const address = staticServer?.address()
const pageUrl = externalPageUrl
  ?? `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}${siteBase}ru/`
let chrome
let client

try {
  chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1920,1080',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    pageUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })

  const target = await findPageTarget(debugPort, pageUrl, chrome)
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  await client.send('Runtime.enable')
  await waitForHydratedDemo(client)

  const result = await evaluate(client, `(() => {
    location.hash = 'demo'
    const hero = document.querySelector('.hero').getBoundingClientRect()
    const heroContent = document.querySelector('.hero__container').getBoundingClientRect()
    const nav = document.querySelector('.VPNav').getBoundingClientRect()
    const demo = document.querySelector('#demo')
    const demoStyle = getComputedStyle(demo)
    const logoStyle = getComputedStyle(document.querySelector('.hero__logo'))
    const blockTypes = [...document.querySelectorAll('.oe-toolbox__item:not(.oe-toolbox__item--inline)')]
      .map(item => item.dataset.pluginType)
    const inlineTypes = [...document.querySelectorAll('.oe-toolbox__item--inline')]
      .map(item => item.dataset.pluginType)
    return {
      blockTypes,
      inlineTypes,
      editorBlocks: document.querySelectorAll('.live-demo .oe-block').length,
      outlineStyle: demoStyle.outlineStyle,
      borderWidths: [demoStyle.borderTopWidth, demoStyle.borderRightWidth, demoStyle.borderBottomWidth, demoStyle.borderLeftWidth],
      boxShadow: demoStyle.boxShadow,
      heroHeight: hero.height,
      availableHeight: innerHeight - nav.height,
      heroCenterDelta: Math.abs((heroContent.top + heroContent.height / 2) - (hero.top + hero.height / 2)),
      dark: document.documentElement.classList.contains('dark'),
      logoFilter: logoStyle.filter,
      removedSectionPresent: /Up and running in minutes|Запуск за несколько минут/.test(document.body.textContent),
    }
  })()`)

  assert(JSON.stringify(result.blockTypes) === JSON.stringify(expectedBlockTypes), `VitePress demo block plugins diverge: ${result.blockTypes.join(', ')}`)
  assert(JSON.stringify(result.inlineTypes) === JSON.stringify(['color', 'mention']), `VitePress demo inline plugins diverge: ${result.inlineTypes.join(', ')}`)
  assert(result.editorBlocks > 0, 'VitePress demo contains no rendered editor blocks')
  assert(result.outlineStyle === 'none', `#demo has an outline: ${result.outlineStyle}`)
  assert(result.borderWidths.every(width => width === '0px'), `#demo has a border: ${result.borderWidths.join(' ')}`)
  assert(result.boxShadow === 'none', `#demo has a box shadow: ${result.boxShadow}`)
  assert(Math.abs(result.heroHeight - result.availableHeight) <= 2, `Hero does not fill the available viewport: ${result.heroHeight} vs ${result.availableHeight}`)
  assert(result.heroCenterDelta <= 2, `Hero content is not vertically centered (delta ${result.heroCenterDelta}px)`)
  assert(!result.removedSectionPresent, 'Removed quick-start code section is still visible')
  if (result.dark) assert(result.logoFilter === 'none', `Dark-theme hero logo has an unexpected filter: ${result.logoFilter}`)

  await verifyDemoTooltips(client, 'ru')

  const navigationLayering = await evaluate(client, `(() => {
    const nav = document.querySelector('.VPNav')
    const block = document.querySelector('.live-demo .oe-block')
    if (!(nav instanceof HTMLElement) || !(block instanceof HTMLElement)) return null
    const previousStyle = block.getAttribute('style')
    const wasLayerOpen = block.hasAttribute('data-oe-layer-open')
    try {
      const navRect = nav.getBoundingClientRect()
      block.dataset.oeLayerOpen = 'true'
      for (const [property, value] of Object.entries({
        position: 'fixed',
        left: String(navRect.left) + 'px',
        top: String(navRect.top) + 'px',
        width: String(navRect.width) + 'px',
        height: String(navRect.height) + 'px',
        background: '#4357b4',
        pointerEvents: 'auto',
      })) {
        block.style.setProperty(property, value, 'important')
      }
      const topElement = document.elementFromPoint(
        navRect.left + navRect.width / 2,
        navRect.top + navRect.height / 2,
      )
      return {
        navOnTop: topElement === nav || nav.contains(topElement),
        activeBlockZ: getComputedStyle(block).zIndex,
        topElement: (topElement?.tagName || 'none') + '.' + (topElement?.className || ''),
      }
    } finally {
      if (previousStyle === null) block.removeAttribute('style')
      else block.setAttribute('style', previousStyle)
      if (!wasLayerOpen) block.removeAttribute('data-oe-layer-open')
    }
  })()`)
  assert(navigationLayering, 'Could not inspect documentation navigation layering')
  assert(
    navigationLayering.navOnTop,
    `Active plugin block covers the documentation navigation (block z-index ${navigationLayering.activeBlockZ}, top ${navigationLayering.topElement})`,
  )

  const mentionPrepared = await evaluate(client, `(() => {
    const editable = [...document.querySelectorAll('.live-demo [contenteditable="true"]')]
      .find(element => element.textContent?.includes('Rector'))
    if (!(editable instanceof HTMLElement)) return false
    editable.focus()
    const selection = getSelection()
    const range = document.createRange()
    range.selectNodeContents(editable)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
    return true
  })()`)
  assert(mentionPrepared, 'Could not focus a text block for mention QA')
  await client.send('Input.insertText', { text: ' ' })
  await client.send('Input.insertText', { text: '@' })
  await client.send('Input.insertText', { text: 'Ада' })
  await delay(300)

  const mentionResults = await evaluate(client, `(() => ({
    active: Boolean(document.querySelector('.oe-mention-dropdown--active')),
    items: [...document.querySelectorAll('.oe-mention-item[data-index]')]
      .map(item => item.textContent?.replace(/\\s+/g, ' ').trim() ?? ''),
  }))()`)
  assert(mentionResults.active, 'Mention suggestions did not open for a known person')
  assert(mentionResults.items.some(item => item.includes('Ада Лавлейс')), `Known mention was not found: ${mentionResults.items.join(', ')}`)

  const mentionCommitted = await evaluate(client, `(() => {
    const item = [...document.querySelectorAll('.oe-mention-item[data-index]')]
      .find(element => element.textContent?.includes('Ада Лавлейс'))
    if (!(item instanceof HTMLElement)) return false
    item.click()
    return true
  })()`)
  assert(mentionCommitted, 'Could not select the known mention')
  await delay(200)

  const mentionWidget = await evaluate(client, `(() => {
    const widget = [...document.querySelectorAll('.live-demo [data-inline-plugin="mention"]')]
      .find(element => element.textContent?.includes('Ада Лавлейс'))
    return widget ? {
      text: widget.textContent,
      styled: getComputedStyle(widget).display !== 'inline',
    } : null
  })()`)
  assert(mentionWidget?.text?.includes('Ада Лавлейс'), 'Selected mention was not committed to the document')
  assert(mentionWidget.styled, 'Mention stylesheet was not applied')

  if (qaRoot) {
    const switchedToLight = await evaluate(client, `(() => {
      if (!document.documentElement.classList.contains('dark')) return true
      const appearance = document.querySelector('.VPSwitchAppearance')
      if (!(appearance instanceof HTMLElement)) return false
      appearance.click()
      return true
    })()`)
    assert(switchedToLight, 'Could not switch the documentation to the light theme for search QA')
    await delay(300)
  }

  const searchShortcut = await evaluate(client, `(() => {
    const button = document.querySelector('.VPNavBarSearchButton')
    const label = button?.querySelector('.text')
    const keys = button?.querySelector('.keys')
    if (!(button instanceof HTMLElement) || !(keys instanceof HTMLElement)) return null
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    const dispatched = window.dispatchEvent(event)
    const buttonRect = button.getBoundingClientRect()
    const labelRect = label?.getBoundingClientRect()
    const keysRect = keys.getBoundingClientRect()
    const style = getComputedStyle(button)
    const navStyle = getComputedStyle(document.querySelector('.VPNavBar'))
    return {
      prevented: event.defaultPrevented && !dispatched,
      width: buttonRect.width,
      keyOnRight: keysRect.right <= buttonRect.right && (!labelRect || keysRect.left > labelRect.right),
      background: style.backgroundColor,
      navBackground: navStyle.backgroundColor,
      borderWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
    }
  })()`)
  assert(searchShortcut, 'Header search button is missing')
  assert(searchShortcut.prevented, 'Ctrl+K was not cancelled before the browser default action')
  assert(searchShortcut.width >= 350, `Header search field is too narrow: ${searchShortcut.width}px`)
  assert(searchShortcut.keyOnRight, 'Ctrl K hint is not aligned to the right side of the search field')
  assert(searchShortcut.background !== searchShortcut.navBackground, 'Header search field is indistinguishable from the light header')
  assert(searchShortcut.borderWidth !== '0px' && searchShortcut.borderColor !== 'rgba(0, 0, 0, 0)', 'Header search field has no visible border')

  let localSearch = null
  const localSearchDeadline = Date.now() + 3000
  while (Date.now() < localSearchDeadline) {
    localSearch = await evaluate(client, `(() => {
      const input = document.querySelector('.VPLocalSearchBox .search-input')
      const shell = document.querySelector('.VPLocalSearchBox .shell')
      if (!(input instanceof HTMLInputElement) || !(shell instanceof HTMLElement)) return null
      const inputStyle = getComputedStyle(input.closest('.search-bar'))
      return {
        focused: document.activeElement === input,
        shellVisible: shell.getBoundingClientRect().width > 0,
        focusBorder: inputStyle.borderTopColor,
        focusShadow: inputStyle.boxShadow,
      }
    })()`)
    if (localSearch?.shellVisible && localSearch.focused) break
    await delay(100)
  }
  assert(localSearch?.shellVisible, 'Ctrl+K did not open the local search modal')
  assert(localSearch.focused, 'Ctrl+K did not focus the local search input')
  assert(localSearch.focusShadow === 'none', `Local search input kept a focus shadow: ${localSearch.focusShadow}`)

  if (qaRoot) {
    await mkdir(qaRoot, { recursive: true })
    await captureScreenshot(client, join(qaRoot, 'search-implementation-light.png'))

    await evaluate(client, `document.querySelector('.VPLocalSearchBox .backdrop')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
    await delay(200)
    await captureScreenshot(client, join(qaRoot, 'header-search-implementation-light.png'))

    const imagePrepared = await evaluate(client, `(() => {
      const block = [...document.querySelectorAll('.live-demo .oe-block')].at(-1)
      const editable = block?.querySelector('[contenteditable="true"]') ?? block
      if (!(editable instanceof HTMLElement)) return { ok: false, step: 'editable' }
      editable.focus()
      editable.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
      editable.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      const button = [...document.querySelectorAll('.live-demo .oe-toolbar__btn')]
        .find(item => item.getAttribute('aria-haspopup') === 'menu' && getComputedStyle(item.closest('.oe-toolbar')).display !== 'none')
      if (!(button instanceof HTMLButtonElement)) return { ok: false, step: 'toolbox' }
      button.click()
      return { ok: true }
    })()`)
    assert(imagePrepared?.ok, `Could not focus the demo editor for light-theme accent QA (${imagePrepared?.step ?? 'unknown'})`)
    await delay(200)

    const imageInserted = await evaluate(client, `(() => {
      const item = document.querySelector('.live-demo .oe-toolbox__item[data-plugin-type="image"]')
      if (!(item instanceof HTMLElement)) return false
      item.click()
      return true
    })()`)
    assert(imageInserted, 'Could not insert the image block for light-theme accent QA')
    await delay(200)

    const imageSourceAdded = await evaluate(client, `(() => {
      const image = [...document.querySelectorAll('.live-demo .oe-image')].at(-1)
      const dropzone = image?.querySelector('.oe-image__select')
      if (!(dropzone instanceof HTMLElement)) return false
      const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'rector-qa.png', { type: 'image/png' }))
      dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
      return true
    })()`)
    assert(imageSourceAdded, 'Could not add an image for light-theme accent QA')
    await delay(250)

    const lightAccent = await evaluate(client, `(() => {
      const editor = document.querySelector('.live-demo .oe-editor')
      const image = [...document.querySelectorAll('.live-demo .oe-image')].at(-1)
      const settings = [...(image?.querySelectorAll('.oe-image__action-btn') ?? [])]
        .find(item => /Settings|Настройки/i.test(item.textContent ?? ''))
      if (!(editor instanceof HTMLElement) || !(settings instanceof HTMLButtonElement)) return null
      image?.scrollIntoView({ block: 'center' })
      const rect = settings.getBoundingClientRect()
      return {
        token: getComputedStyle(editor).getPropertyValue('--oe-accent').trim().toLowerCase(),
        button: getComputedStyle(settings, '::before').backgroundColor,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
    })()`)
    assert(lightAccent, 'Could not inspect the image settings accent in the light theme')
    assert(lightAccent.token === '#4357b4', `Light editor accent diverged: ${lightAccent.token}`)
    assert(lightAccent.button === 'rgb(67, 87, 180)', `Light plugin action accent diverged: ${lightAccent.button}`)
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: lightAccent.x, y: lightAccent.y })
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: lightAccent.x, y: lightAccent.y })
    await delay(100)
    assert(await evaluate(client, "document.querySelector('.live-demo .oe-image__dropdown-panel .oe-image__style-form')?.checkVisibility()"), 'Separate demo Image settings did not open')
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: lightAccent.x, y: lightAccent.y })
    await delay(250)
    await captureScreenshot(client, join(qaRoot, 'plugin-settings-accent-light.png'))

    const carouselPrepared = await evaluate(client, `(() => {
      const appearance = document.querySelector('.VPSwitchAppearance')
      if (!document.documentElement.classList.contains('dark') && appearance instanceof HTMLElement) appearance.click()

      const blocks = [...document.querySelectorAll('.live-demo .oe-block')]
      const block = blocks.at(-1)
      const editable = block?.querySelector('[contenteditable="true"]') ?? block
      if (!(editable instanceof HTMLElement)) return { ok: false, step: 'editable' }
      editable.focus()
      editable.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
      editable.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return { ok: true }
    })()`)
    assert(carouselPrepared?.ok, `Could not focus the demo editor for carousel QA (${carouselPrepared?.step ?? 'unknown'})`)
    await delay(250)

    const toolboxOpened = await evaluate(client, `(() => {
      const button = [...document.querySelectorAll('.live-demo .oe-toolbar__btn')]
        .find(item => item.getAttribute('aria-haspopup') === 'menu' && getComputedStyle(item.closest('.oe-toolbar')).display !== 'none')
      if (!(button instanceof HTMLButtonElement)) return false
      button.click()
      return true
    })()`)
    assert(toolboxOpened, 'Could not open the editor toolbox for carousel QA')
    await delay(200)

    const carouselInserted = await evaluate(client, `(() => {
      const item = document.querySelector('.live-demo .oe-toolbox__item[data-plugin-type="carousel"]')
      if (!(item instanceof HTMLElement)) return false
      item.click()
      return true
    })()`)
    assert(carouselInserted, 'Could not insert the carousel block for QA')
    await delay(250)

    const sourceEditorOpened = await evaluate(client, `(() => {
      const carousel = [...document.querySelectorAll('.live-demo .oe-carousel-block')].at(-1)
      const addUrl = [...(carousel?.querySelectorAll('.oe-carousel-block__select-link') ?? [])]
        .find(item => /URL/i.test(item.textContent ?? ''))
      if (!(addUrl instanceof HTMLElement)) return false
      addUrl.click()
      return true
    })()`)
    assert(sourceEditorOpened, 'Could not open the carousel URL editor for QA')
    await delay(200)
    await captureScreenshot(client, join(qaRoot, 'carousel-url-editor-dark.png'))

    const sourceEditorStyled = await evaluate(client, `(() => {
      const root = document.querySelector('.live-demo .oe-carousel-block .oe-source-editor[data-oe-source-editor="url"][aria-hidden="false"]')
      const panel = root?.querySelector('.oe-source-editor__panel')
      const field = root?.querySelector('.oe-source-editor__field')
      if (!(root instanceof HTMLElement)
          || !(panel instanceof HTMLFormElement)
          || !(field instanceof HTMLInputElement)) return { ok: false }
      const rootStyle = getComputedStyle(root)
      const panelStyle = getComputedStyle(panel)
      const fieldStyle = getComputedStyle(field)
      const metrics = {
        rootPosition: rootStyle.position,
        panelDisplay: panelStyle.display,
        panelBackground: panelStyle.backgroundColor,
        fieldMinHeight: parseFloat(fieldStyle.minHeight),
        fieldWidth: field.getBoundingClientRect().width,
        sourceStyleIds: [...document.querySelectorAll('style[data-vite-dev-id]')]
          .map(style => style.getAttribute('data-vite-dev-id'))
          .filter(id => /sourceEditor/i.test(id || '')),
        sourceResources: performance.getEntriesByType('resource')
          .map(entry => entry.name)
          .filter(name => /LiveDemo|sourceEditor/i.test(name)),
        sourceRulePresent: [...document.styleSheets].some(sheet => {
          try {
            return [...sheet.cssRules].some(rule => rule.selectorText === '.oe-source-editor')
          } catch {
            return false
          }
        }),
      }
      field.value = new URL(${JSON.stringify(`${siteBase}logo.svg`)}, location.href).href
      panel.requestSubmit()
      return {
        ok: true,
        ...metrics,
      }
    })()`)
    assert(
      sourceEditorStyled?.ok
        && sourceEditorStyled.rootPosition === 'absolute'
        && sourceEditorStyled.panelDisplay === 'grid'
        && sourceEditorStyled.panelBackground !== 'rgba(0, 0, 0, 0)'
        && sourceEditorStyled.fieldMinHeight >= 40
        && sourceEditorStyled.fieldWidth > 200,
      `Homepage demo rendered an unstyled carousel URL editor: ${JSON.stringify(sourceEditorStyled)}`,
    )
    await delay(300)

    const htmlEditorOpened = await evaluate(client, `(() => {
      const carousel = [...document.querySelectorAll('.live-demo .oe-carousel-block')].at(-1)
      const add = [...(carousel?.querySelectorAll('.oe-carousel-block__action-btn') ?? [])]
        .find(item => /Добавить|Add/i.test(item.textContent ?? ''))
      if (!(add instanceof HTMLButtonElement)) return false
      add.click()
      const html = [...(carousel?.querySelectorAll('.oe-carousel-block__action-btn') ?? [])]
        .find(item => /HTML/i.test(item.textContent ?? ''))
      if (!(html instanceof HTMLButtonElement)) return false
      html.click()
      return true
    })()`)
    assert(htmlEditorOpened, 'Could not open the carousel HTML editor for QA')
    await delay(200)
    await captureScreenshot(client, join(qaRoot, 'carousel-html-editor-dark.png'))

    const htmlEditorStyled = await evaluate(client, `(() => {
      const root = document.querySelector('.live-demo .oe-carousel-block .oe-source-editor[data-oe-source-editor="html"][aria-hidden="false"]')
      const panel = root?.querySelector('.oe-source-editor__panel')
      const field = root?.querySelector('.oe-source-editor__field')
      const cancel = root?.querySelector('.oe-source-editor__button--secondary')
      if (!(root instanceof HTMLElement)
          || !(panel instanceof HTMLFormElement)
          || !(field instanceof HTMLTextAreaElement)
          || !(cancel instanceof HTMLButtonElement)) return { ok: false }
      const rootRect = root.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const metrics = {
        rootHeight: rootRect.height,
        panelHeight: panelRect.height,
        panelWidth: panelRect.width,
        textAlign: getComputedStyle(panel).textAlign,
        rows: field.rows,
        fieldMinHeight: parseFloat(getComputedStyle(field).minHeight),
      }
      cancel.click()
      return { ok: true, ...metrics }
    })()`)
    assert(
      htmlEditorStyled?.ok
        && htmlEditorStyled.rootHeight >= htmlEditorStyled.panelHeight
        && htmlEditorStyled.panelWidth <= 512
        && htmlEditorStyled.textAlign === 'left'
        && htmlEditorStyled.rows === 6
        && htmlEditorStyled.fieldMinHeight >= 144,
      `Homepage demo rendered an inconsistent carousel HTML editor: ${JSON.stringify(htmlEditorStyled)}`,
    )
    await delay(200)

    const settingsOpened = await evaluate(client, `(() => {
      const carousel = [...document.querySelectorAll('.live-demo .oe-carousel-block')].at(-1)
      const settings = [...(carousel?.querySelectorAll('.oe-carousel-block__action-btn') ?? [])]
        .find(item => /Настройки|Settings/i.test(item.textContent ?? ''))
      if (!(settings instanceof HTMLElement)) return false
      settings.click()
      carousel?.scrollIntoView({ block: 'center' })
      return true
    })()`)
    assert(settingsOpened, 'Could not open carousel settings for QA')
    await delay(350)
    await captureScreenshot(client, join(qaRoot, 'carousel-implementation-dark.png'))

    const carouselSettingsStyled = await evaluate(client, `(() => {
      const panel = document.querySelector('.live-demo .oe-carousel-block__dropdown-panel')
      const field = panel?.querySelector('.oe-carousel-block__field input')
      const toggle = panel?.querySelector('.oe-carousel-block__switch input')
      if (!(panel instanceof HTMLElement)
          || !(field instanceof HTMLInputElement)
          || !(toggle instanceof HTMLInputElement)) return { ok: false }
      const panelStyle = getComputedStyle(panel)
      const fieldStyle = getComputedStyle(field)
      const toggleStyle = getComputedStyle(toggle)
      return {
        ok: true,
        width: panel.getBoundingClientRect().width,
        padding: panelStyle.padding,
        borderRadius: panelStyle.borderRadius,
        fieldHeight: field.getBoundingClientRect().height,
        fieldBorderWidth: fieldStyle.borderTopWidth,
        toggleWidth: toggle.getBoundingClientRect().width,
        toggleHeight: toggle.getBoundingClientRect().height,
      }
    })()`)
    assert(
      carouselSettingsStyled?.ok
        && carouselSettingsStyled.width === 400
        && carouselSettingsStyled.padding === '12px'
        && carouselSettingsStyled.borderRadius === '8px'
        && carouselSettingsStyled.fieldHeight === 22
        && carouselSettingsStyled.fieldBorderWidth === '0px'
        && carouselSettingsStyled.toggleWidth === 28
        && carouselSettingsStyled.toggleHeight === 16,
      `Carousel settings no longer match Image/Gallery styling: ${JSON.stringify(carouselSettingsStyled)}`,
    )

    const carouselActionTarget = await evaluate(client, `(() => {
      const carousel = [...document.querySelectorAll('.live-demo .oe-carousel-block')].at(-1)
      const add = [...(carousel?.querySelectorAll('.oe-carousel-block__action-btn') ?? [])]
        .find(item => /Добавить|Add/i.test(item.textContent ?? ''))
      if (!(add instanceof HTMLButtonElement)) return null
      const rect = add.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })()`)
    assert(carouselActionTarget, 'Could not locate a carousel action button for hover QA')
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: carouselActionTarget.x,
      y: carouselActionTarget.y,
    })
    await delay(300)
    await captureScreenshot(client, join(qaRoot, 'carousel-action-hover-dark.png'))

    const carouselActionEffect = await evaluate(client, `(() => {
      const carousel = [...document.querySelectorAll('.live-demo .oe-carousel-block')].at(-1)
      const add = [...(carousel?.querySelectorAll('.oe-carousel-block__action-btn') ?? [])]
        .find(item => /Добавить|Add/i.test(item.textContent ?? ''))
      if (!(add instanceof HTMLButtonElement)) return null
      const pseudo = getComputedStyle(add, '::before')
      const matrix = new DOMMatrixReadOnly(pseudo.transform)
      return {
        background: pseudo.backgroundColor,
        scaleX: matrix.a,
        scaleY: matrix.d,
      }
    })()`)
    assert(
      carouselActionEffect
        && carouselActionEffect.background === 'rgb(67, 87, 180)'
        && carouselActionEffect.scaleX >= 0.99
        && carouselActionEffect.scaleY >= 0.99,
      `Carousel actions no longer use the Image/Gallery accent scale effect: ${JSON.stringify(carouselActionEffect)}`,
    )
  }

  const englishUrl = new URL('../', pageUrl).href
  await client.send('Page.navigate', { url: englishUrl })
  for (let attempt = 0; attempt < 100; attempt++) {
    const ready = await evaluate(client, "document.documentElement.lang.startsWith('en') && Boolean(document.querySelector('.live-demo .oe-editor .oe-block'))")
    if (ready) break
    await delay(100)
  }
  await waitForHydratedDemo(client)
  await verifyDemoTooltips(client, 'en')

  assert(missingRequests.length === 0, `VitePress requested missing assets: ${[...new Set(missingRequests)].join(', ')}`)

  console.log(JSON.stringify({
    blockPlugins: result.blockTypes.length,
    inlinePlugins: result.inlineTypes.length,
    editorBlocks: result.editorBlocks,
    demoFrame: false,
    heroViewport: true,
    heroCentered: true,
    navAbovePluginBlocks: true,
    localSearchShortcut: true,
    searchKeyAlignedRight: true,
    mentionAutocomplete: true,
    localizedTooltips: { languages: ['ru', 'en'], themes: ['light', 'dark'], shortcuts: true },
    headingLevelMenu: { languages: ['ru', 'en'], themes: ['light', 'dark'], keyboard: true, selection: true },
    conversionMenu: { languages: ['ru', 'en'], themes: ['light', 'dark'], outsideToolbar: true, searchSelection: true },
    alignmentSelectionState: { languages: ['ru', 'en'], currentBlock: true, atomicUndo: true },
    movedBlockButtons: { languages: ['ru', 'en'], geometry: true, atomicUndo: true },
    tuneFragmentConversion: { languages: ['ru', 'en'], unselectedEdges: true, atomicUndoRedo: true },
    crossImageConversion: { languages: ['ru', 'en'], singleTarget: true, unselectedListItem: true, atomicUndoRedo: true },
    missingAssets: 0,
  }))
} finally {
  client?.close()
  await stopProcess(chrome)
  if (staticServer) await new Promise(resolve => staticServer.close(resolve))
  await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 })
}
