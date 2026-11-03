import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from '../../node_modules/vite/dist/node/index.js'
import { findChrome } from '../../tests/browser/environment.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ? pathToFileURL(resolve(process.env.EDITOR_PLAYWRIGHT_PATH)).href : 'playwright')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 })
const [ref, extra] = process.argv.slice(2)
assert.equal(extra, undefined, 'Provide at most one immutable production revision')
const sourceRef = ref ? git('rev-parse', '--verify', '--end-of-options', ref + '^{commit}').toString().trim() : null
const head = git('rev-parse', 'HEAD').toString().trim(), startedAt = new Date().toISOString()
const kinds = ['fixed-top', 'fixed-bottom', 'fixed-center', 'popover', 'flow', 'contained-fixed', 'scrolling-flow', 'tall-fixed', 'hover-fixed', 'focus-fixed', 'hidden-fixed', 'body-fixed']
const kindFilter = process.env.EDITOR_HTML_LAYER_KIND
assert.ok(kindFilter === undefined || kinds.includes(kindFilter), 'Unknown HTML layer kind')
const paths = ['scripts/parity/html-native-layers.mjs', 'package-lock.json', 'node_modules/dompurify/dist/purify.es.mjs']
const sourceHashes = Object.fromEntries(paths.map(path => [path, hash(readFileSync(resolve(root, path)))]))
const modules = {}, moduleBytes = new Map()
const sourcePlugin = {
  name: 'native-layer-source', enforce: 'pre',
  load(id) {
    const file = resolve(id.split('?')[0]), path = relative(root, file).split(sep).join('/')
    if (!/^(?:core|shared|plugins|plugin-kit|inline-plugins|inline-tools|renderer|preset|locale)\/.+\.(?:js|css)$/.test(path)) return
    if (!moduleBytes.has(path)) moduleBytes.set(path, sourceRef ? git('show', sourceRef + ':' + path) : readFileSync(file))
    const bytes = moduleBytes.get(path)
    modules[path] = hash(bytes)
    return sourceRef ? bytes.toString('utf8') : undefined
  },
}
const server = await createServer({ cacheDir: 'test-results/html-native-layer-cache', logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 }, plugins: [sourcePlugin, {
    name: 'native-layer-reference', configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/native-layer-reference') { next(); return }
        res.setHeader('content-type', 'text/html')
        res.setHeader('content-security-policy', "default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data:;media-src 'self' blob:;object-src 'none';require-trusted-types-for 'script';trusted-types rector dompurify")
        res.end('<!doctype html><title>HTML native layers</title>')
      })
    },
  }] })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, executablePath: findChrome() })
  const results = []
  for (const kind of kinds.filter(kind => kindFilter === undefined || kind === kindFilter)) {
    for (const surface of ['native', 'raw-editor', 'raw-renderer', 'carousel-editor', 'carousel-renderer']) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } }), errors = []
      page.on('pageerror', error => errors.push(String(error)))
      let observation, resized, closed, escaped, hostClicks, sourceUnchanged, error
      try {
        await page.goto(server.resolvedUrls.local[0] + 'native-layer-reference')
        await page.evaluate(async ({ kind, surface }) => {
          const holder = document.createElement('section')
          holder.style.cssText = 'width:600px' + (kind === 'body-fixed' ? '' : ';margin-top:60px'); document.body.append(holder)
          const dynamic = kind === 'hover-fixed' || kind === 'focus-fixed'
          const layered = kind.startsWith('fixed-') || kind === 'tall-fixed' || kind === 'body-fixed' || dynamic
          const action = '<button id="owned-action" popovertarget="owned-result">End action</button>'
          const result = '<div id="owned-result" popover>Action completed<button id="owned-dismiss" popovertarget="owned-result" popovertargetaction="hide">Dismiss</button></div>'
          const html = kind === 'popover'
            ? '<button id="owned-open" popovertarget="owned-layer">Open details</button><div id="owned-layer" popover><p>Native popover</p><button id="owned-close" popovertarget="owned-layer" popovertargetaction="hide">Close details</button></div>'
            : dynamic ? '<div id="owned-container"><button id="owned-trigger">Reveal content</button><div id="owned-layer">Fixed content' + action + '</div></div>' + result
              : layered ? '<div id="owned-layer">Fixed content' + action + '</div>' + (kind === 'tall-fixed' ? '<div id="owned-tall">Tall flow</div>' : '') + result
              : kind === 'hidden-fixed' ? '<button>Ordinary control</button><div id="owned-layer">Invisible fixed content</div>'
              : kind === 'contained-fixed' ? '<div id="owned-container"><div id="owned-layer">Contained fixed content</div></div>'
                : '<div id="owned-flow">Ordinary flow</div>'
          const placement = dynamic ? 'top:200px' : kind === 'fixed-bottom' || kind === 'tall-fixed' ? 'bottom:40px' : kind === 'fixed-center' ? 'top:50%;transform:translateY(-50%)' : 'top:0'
          const contentStyles = ['html,body{margin:0}body{display:flow-root;font:16px/20px sans-serif}'
            + (layered || kind === 'hidden-fixed' ? `#owned-layer{position:fixed;${placement};left:0;width:240px;height:140px;background:rgb(240,240,240)}#owned-action{position:absolute;bottom:4px;left:4px}` : '')
            + '#owned-tall{height:1200px}'
            + (kind === 'contained-fixed' ? '#owned-container{position:relative;transform:translateX(0);height:80px}#owned-container>#owned-layer{position:fixed;bottom:0;left:0;width:240px;height:70px}' : '')
            + (dynamic ? `#owned-layer{display:none}#owned-container:${kind === 'hover-fixed' ? 'hover' : 'focus-within'}>#owned-layer{display:block}` : '')
            + (kind === 'hidden-fixed' ? '#owned-layer{visibility:hidden}' : '')
            + (kind === 'body-fixed' ? 'body{position:fixed;bottom:40px;left:0;width:240px;height:140px}#owned-layer{position:relative;inset:auto;height:140px}' : '')
            + '#owned-flow{height:40px}'
            + (kind === 'scrolling-flow' ? 'body{height:100px;overflow:auto}#owned-flow{height:300px}' : '')
            + (kind === 'popover' ? '#owned-layer{position:fixed;inset:auto;left:10px;top:30px;margin:0;width:240px;height:160px;max-height:none;padding:4px;border:1px solid}#owned-close{position:absolute;bottom:4px;left:4px}' : '')
            + 'p{margin:0}']
          const host = document.createElement('button'); host.id = 'host'; host.textContent = 'Host action'
          host.style.cssText = 'position:fixed;right:10px;top:10px;z-index:99'; document.body.append(host)
          let hostClicks = 0; host.addEventListener('click', () => hostClicks++)
          let child = document, frame, editor, renderer, data
          if (surface === 'native') {
            const { toTrustedHtml } = await import('/shared/sanitize/trustedHtml.js')
            holder.innerHTML = toTrustedHtml(html)
            const sheet = new CSSStyleSheet(); sheet.replaceSync(contentStyles[0]); document.adoptedStyleSheets = [sheet]
          } else {
            const [type, mode] = surface.split('-')
            data = { version: '2.0.0', blocks: [{ id: 'content', type, dataVersion: 1, data: type === 'raw' ? { html }
              : { slides: [{ id: 'html', type: 'html', html, caption: '' }], options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false } } }] }
            if (mode === 'editor') {
              const { createEditor } = await import('/core/index.js'), module = await import('/plugins/' + type + '/index.js')
              editor = createEditor({ holder, data, contentStyles, readOnly: true, injectStyles: false,
                plugins: [type === 'raw' ? module.createRawPlugin({ injectStyles: false }) : module.createCarouselPlugin({ injectStyles: false })] })
            } else {
              const { EditorRenderer } = await import('/renderer/index.js')
              renderer = new EditorRenderer({ blockTypes: [type], contentStyles, injectStyles: false }); renderer.renderTo(data, holder)
            }
            frame = holder.querySelector('iframe')
            const deadline = performance.now() + 5000
            while (frame.contentDocument?.URL !== 'about:srcdoc' || frame.contentDocument.readyState !== 'complete'
              || !frame.contentDocument.body?.children.length) {
              if (performance.now() > deadline) throw Error('Author content unavailable')
              await new Promise(resolve => setTimeout(resolve, 10))
            }
            child = frame.contentDocument
          }
          const before = JSON.stringify(editor ? editor.save().blocks : data?.blocks)
          window.probe = { child, frame, hostClicks: () => hostClicks,
            unchanged: () => before === JSON.stringify(editor ? editor.save().blocks : data?.blocks),
            destroy: () => { editor?.destroy(); renderer?.destroy() },
            read: () => {
              const element = child.getElementById(layered || kind === 'popover' || kind === 'contained-fixed' || kind === 'hidden-fixed' ? 'owned-layer' : 'owned-flow')
              const box = element.getBoundingClientRect(), view = child.defaultView
              return { frameHeight: frame?.getBoundingClientRect().height ?? null, viewportHeight: view.innerHeight,
                bodyHeight: child.body.getBoundingClientRect().height,
                box: { top: box.top, bottom: box.bottom, height: box.height },
                visibleHeight: Math.max(0, Math.min(box.bottom, view.innerHeight) - Math.max(box.top, 0)),
                popoverOpen: !!child.querySelector('#owned-layer:popover-open') }
            } }
        }, { kind, surface })
        await page.waitForTimeout(100)
        const target = surface === 'native' ? page : await (await page.locator('iframe').elementHandle()).contentFrame()
        if (kind === 'popover') await target.locator('#owned-open').click({ timeout: 3000 })
        if (kind === 'hover-fixed') await target.locator('#owned-trigger').hover({ timeout: 3000 })
        if (kind === 'focus-fixed') {
          let focused = false
          for (let turn = 0; turn < 12 && !focused; turn++) {
            await page.keyboard.press('Tab')
            focused = await page.evaluate(() => window.probe.child.activeElement?.id === 'owned-trigger')
          }
          assert.equal(focused, true, 'Native keyboard cannot reach the reveal control')
        }
        await page.waitForTimeout(100)
        observation = await page.evaluate(() => window.probe.read())
        const dynamic = kind === 'hover-fixed' || kind === 'focus-fixed'
        const layered = kind.startsWith('fixed-') || kind === 'tall-fixed' || kind === 'body-fixed' || dynamic
        if (layered || kind === 'popover' || kind === 'contained-fixed') assert.ok(observation.visibleHeight >= observation.box.height, 'Authored layer is clipped')
        if (kind === 'popover') assert.equal(observation.popoverOpen, true)
        if (surface !== 'native' && ['flow', 'contained-fixed', 'scrolling-flow'].includes(kind)) {
          const expected = Math.max(surface === 'raw-editor' ? 100 : 0, kind === 'flow' ? 40 : kind === 'contained-fixed' ? 80 : 100)
          assert.equal(observation.frameHeight, expected, 'Ordinary or locally contained flow acquired extra viewport height')
        }
        if (surface !== 'native' && kind === 'hidden-fixed') assert.equal(observation.frameHeight, Math.max(surface === 'raw-editor' ? 100 : 0, observation.bodyHeight), 'Invisible fixed box introduced extra viewport space')
        await page.setViewportSize({ width: 1200, height: 900 }); await page.waitForTimeout(100)
        resized = await page.evaluate(() => window.probe.read())
        if (layered || kind === 'popover') assert.ok(resized.visibleHeight >= resized.box.height, 'Resized layer is clipped')
        if (layered) {
          // The frame participates in parent flow. Child-only scrollIntoView
          // cannot move a viewport-fixed box; scroll the parent when needed
          // and dispatch actual trusted pointer input at its visible location.
          let action = await target.locator('#owned-action').boundingBox()
          if (action && (action.y < 0 || action.y + action.height > 900)) {
            await page.mouse.move(1, 1); await page.mouse.wheel(0, action.y < 0 ? -1500 : 1500); await page.waitForTimeout(100)
            action = await target.locator('#owned-action').boundingBox()
          }
          assert.ok(action && action.y >= 0 && action.y + action.height <= 900, 'Flow end action is unreachable')
          await page.mouse.click(action.x + action.width / 2, action.y + action.height / 2)
          assert.equal(await page.evaluate(() => window.probe.child.getElementById('owned-result').matches(':popover-open')), true, 'End action unavailable')
          await target.locator('#owned-dismiss').click({ timeout: 3000 })
        }
        if (kind === 'popover') {
          await target.locator('#owned-close').click({ timeout: 3000 }); await page.waitForTimeout(100)
          closed = await page.evaluate(() => window.probe.read())
          assert.equal(closed.popoverOpen, false, 'Native close action unavailable')
          if (surface !== 'native') assert.equal(closed.frameHeight, Math.max(surface === 'raw-editor' ? 100 : 0, closed.bodyHeight), 'Closed layer retained viewport space')
          await target.locator('#owned-open').click({ timeout: 3000 }); await page.keyboard.press('Escape'); await page.waitForTimeout(100)
          escaped = await page.evaluate(() => window.probe.read())
          assert.equal(escaped.popoverOpen, false, 'Native Escape unavailable')
        }
        await page.locator('#host').click({ timeout: 3000 })
        hostClicks = await page.evaluate(() => window.probe.hostClicks())
        assert.equal(hostClicks, 1, 'Host action intercepted')
        if (dynamic && surface !== 'native') {
          await page.waitForTimeout(100)
          closed = await page.evaluate(() => window.probe.read())
          assert.equal(closed.frameHeight, Math.max(surface === 'raw-editor' ? 100 : 0, closed.bodyHeight), 'Inactive CSS layer retained viewport space')
        }
        sourceUnchanged = await page.evaluate(() => window.probe.unchanged())
        assert.equal(sourceUnchanged, true, 'Native interaction changed canonical data')
        assert.deepEqual(errors, [])
      } catch (failure) { error = String(failure) }
      finally { await page.evaluate(() => window.probe?.destroy()).catch(() => {}); await page.close() }
      results.push({ kind, surface, observation, resized, closed, escaped, hostClicks, sourceUnchanged, errors, error })
    }
  }
  for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(hash(readFileSync(resolve(root, path))), expected, path + ' changed')
  for (const [path, expected] of Object.entries(modules)) assert.equal(hash(sourceRef ? git('show', sourceRef + ':' + path) : readFileSync(resolve(root, path))), expected, path + ' changed')
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), head)
  console.log(JSON.stringify({ scope: 'Actual Raw/Carousel public surfaces and independent native fixed/popover/flow controls; trusted actions under CSP/Trusted Types',
    startedAt, finishedAt: new Date().toISOString(), head, node: process.version, browser: browser.version(), kindFilter: kindFilter ?? null,
    productionSource: { storage: sourceRef ? 'git-objects' : 'working-tree', sha: sourceRef, modules }, sourceHashes,
    sourceUnchanged: true, results }, null, 2))
  if (results.some(result => result.error || result.errors.length)) process.exitCode = 1
} finally { await browser?.close(); await server.close() }
