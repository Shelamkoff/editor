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
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

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
      settings.click()
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
      const root = document.querySelector('.live-demo .oe-source-editor[data-oe-source-editor="url"]')
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
      const root = document.querySelector('.live-demo .oe-source-editor[data-oe-source-editor="html"]')
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
    missingAssets: 0,
  }))
} finally {
  client?.close()
  await stopProcess(chrome)
  if (staticServer) await new Promise(resolve => staticServer.close(resolve))
  await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 })
}
