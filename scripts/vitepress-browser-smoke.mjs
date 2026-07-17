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
const staticServer = startStaticServer()
await new Promise((resolve, reject) => {
  staticServer.once('error', reject)
  staticServer.listen(0, '127.0.0.1', resolve)
})
const address = staticServer.address()
const pageUrl = `http://127.0.0.1:${address.port}${siteBase}ru/`
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

  await delay(100)
  const localSearch = await evaluate(client, `(() => {
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

    const slideAdded = await evaluate(client, `(() => {
      window.prompt = () => '/logo.svg'
      const carousel = [...document.querySelectorAll('.live-demo .oe-carousel-block')].at(-1)
      const addUrl = [...(carousel?.querySelectorAll('.oe-carousel-block__select-action') ?? [])]
        .find(item => /URL/i.test(item.textContent ?? ''))
      if (!(addUrl instanceof HTMLElement)) return false
      addUrl.click()
      return true
    })()`)
    assert(slideAdded, 'Could not add a URL slide for carousel QA')
    await delay(300)

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
  }

  console.log(JSON.stringify({
    blockPlugins: result.blockTypes.length,
    inlinePlugins: result.inlineTypes.length,
    editorBlocks: result.editorBlocks,
    demoFrame: false,
    heroViewport: true,
    heroCentered: true,
    localSearchShortcut: true,
    searchKeyAlignedRight: true,
  }))
} finally {
  client?.close()
  await stopProcess(chrome)
  await new Promise(resolve => staticServer.close(resolve))
  await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 })
}
