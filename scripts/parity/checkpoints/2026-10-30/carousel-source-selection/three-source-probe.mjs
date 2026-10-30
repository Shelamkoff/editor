import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, join } from 'node:path'
import { chromium } from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const repo = '/tmp/rector-third-carousel-20261030'
const dependencies = '/workspace/scratch/2e2d45a6049b/editor/node_modules'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
const startedAt = new Date().toISOString(), headBefore = git('rev-parse', 'HEAD').toString().trim()
const scriptBytes = await readFile(new URL(import.meta.url))
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', root: '/tmp/rector-v1-5e5c7f8', legacy: true },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', root: '/tmp/rector-e981ff3', legacy: false },
  { label: 'candidate', sha: process.env.CAROUSEL_CANDIDATE_SHA ?? headBefore, root: repo, legacy: false },
].map(source => ({ ...source, loaded: {} }))
const imports = { dompurify: '/dependencies/dompurify/dist/purify.es.mjs' }, dependencyFiles = {}, dependencyVersions = {}
const pending = Object.keys(JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).dependencies).filter(name => name.startsWith('@shelamkoff/'))
const packages = new Set()
while (pending.length) {
  const name = pending.shift()
  if (packages.has(name)) continue
  packages.add(name)
  const manifest = JSON.parse(await readFile(join(dependencies, name, 'package.json'), 'utf8'))
  const exported = manifest.exports['.'], entry = typeof exported === 'string' ? exported : exported.import
  imports[name] = '/dependencies/' + name + '/' + entry.replace(/^\.\//, '')
  dependencyVersions[name] = manifest.version
  pending.push(...Object.keys(manifest.dependencies ?? {}).filter(id => id.startsWith('@shelamkoff/')))
}
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4ZmVPEmIY1TCqYfhqAACwH08Q21f11gAAAABJRU5ErkJggg=='
const videoBytes = await readFile(join(repo, 'tests/browser/carousel-roundtrip-16x16.webm'))
const loaded = new Map(), serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/') {
      response.setHeader('content-type', 'text/html')
      response.end('<!doctype html><meta charset="utf-8"><script type="importmap">' + JSON.stringify({ imports }) + '</script><body></body>'); return
    }
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (pathname === '/media/probe.webm') { response.setHeader('content-type', 'video/webm'); response.end(videoBytes); return }
    if (pathname === '/media/added.png') { response.setHeader('content-type', 'image/png'); response.end(Buffer.from(pixel.split(',')[1], 'base64')); return }
    if (!loaded.has(pathname)) {
      const source = sources.find(source => pathname.startsWith('/' + source.label + '/'))
      assert(source || pathname.startsWith('/dependencies/'), 'Unexpected URL: ' + pathname)
      const relative = pathname.slice(source ? source.label.length + 2 : '/dependencies/'.length)
      const root = source?.root ?? dependencies, path = resolve(root, relative)
      assert(path.startsWith(resolve(root) + '/'), 'Source URL escaped root')
      const bytes = await readFile(path)
      if (source) {
        assert.deepEqual(bytes, git('show', source.sha + ':' + relative), source.label + '/' + relative + ' differs from pinned Git source')
        source.loaded[relative] = digest(bytes)
      } else dependencyFiles[relative] = digest(bytes)
      loaded.set(pathname, { path, bytes })
    }
    response.setHeader('content-type', extname(pathname) === '.css' ? 'text/css' : 'text/javascript')
    response.end(loaded.get(pathname).bytes)
  } catch (error) { serverErrors.push(String(error)); response.statusCode = 500; response.end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = 'http://127.0.0.1:' + server.address().port
let browser
const results = []
const shape = slide => ({ id: slide.id, type: slide.type, src: slide.src ?? null, poster: slide.poster ?? null,
  alt: slide.alt ?? '', html: slide.html ?? null, caption: slide.caption ?? '' })
try {
  browser = await chromium.launch({ executablePath: '/tmp/rector-browsers-156/chrome-linux64/chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  for (const source of sources) for (const action of (process.env.CAROUSEL_PROBE_CASES ?? 'batch,url,html').split(',')) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
    const entry = { source: source.label, action, phases: [], events: [], pageErrors: [], observations: [] }
    results.push(entry)
    page.on('pageerror', error => entry.pageErrors.push(error.stack ?? String(error)))
    const inspect = async phase => {
      await page.evaluate(value => { window.probe.phase = value }, phase)
      await page.waitForTimeout(50)
      const snapshot = await page.evaluate(() => {
        const { editor, holder } = window.probe, caption = holder.querySelector('.oe-carousel-block__caption')
        return { phase: window.probe.phase, blocks: editor.save().blocks,
          activeCaption: caption?.textContent ?? null, activeId: caption?.dataset.slideId ?? null,
          counter: holder.querySelector('.oe-carousel-block__counter')?.textContent ?? null,
          activeElement: { tag: document.activeElement?.tagName, className: document.activeElement?.className,
            blockId: document.activeElement?.closest('[data-block-id]')?.dataset.blockId ?? null },
          canUndo: editor.canUndo, canRedo: editor.canRedo,
          inputUnchanged: JSON.stringify(window.probe.original) === window.probe.originalJson }
      })
      entry.phases.push(snapshot); return snapshot
    }
    const check = (phase, property, actual, expected) => entry.observations.push({ phase, property, actual, expected,
      status: JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS' : 'FAIL' })
    try {
      await page.goto(origin)
      await page.evaluate(async ({ source, pixel }) => {
        const [{ createEditor }, carousel, paragraph] = await Promise.all([
          import('/' + source.label + '/core/index.js'), import('/' + source.label + '/plugins/carousel/index.js'), import('/' + source.label + '/plugins/paragraph/index.js'),
        ])
        const holder = document.createElement('section'); holder.style.width = '640px'; document.body.append(holder)
        const slides = [
          { id: 'alpha', type: 'image', src: pixel, alt: 'Alpha image', caption: 'Alpha' },
          { id: 'bravo', type: 'video', src: location.origin + '/media/probe.webm', poster: pixel, alt: 'Bravo video', caption: 'Bravo' },
          { id: 'charlie', type: 'html', html: '<p>Charlie HTML</p>', caption: 'Charlie' },
        ]
        const added = [
          { id: 'delta', type: 'video', src: location.origin + '/media/probe.webm', poster: pixel, alt: 'Delta video', caption: 'Delta' },
          { id: 'echo', type: 'html', html: '<p>Echo HTML</p>', caption: 'Echo' },
        ]
        const options = { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false, aspectRatio: '16 / 9' }
        const block = (id, type, data) => ({ id, type, ...(!source.legacy ? { dataVersion: type === 'carousel' ? 1 : 2 } : {}), data })
        const original = { version: source.legacy ? '1.0.5' : '2.0.0', blocks: [block('before', 'paragraph', { text: 'Before' }), block('carousel', 'carousel', { slides, options }), block('after', 'paragraph', { text: 'After' })] }
        window.probe = { phase: 'load', holder, original, originalJson: JSON.stringify(original), events: [], calls: 0, slides, added }
        const config = { actions: [{ label: 'Append proof slides', handler: async () => { window.probe.calls++; return structuredClone(added) } }] }
        for (const type of ['click', 'input', 'keydown']) document.addEventListener(type, event => {
          const probe = window.probe
          probe.events.push({ phase: probe.phase, type, trusted: event.isTrusted, key: event.key ?? null, inputType: event.inputType ?? null,
            data: event.data ?? null, blockId: event.target.closest?.('[data-block-id]')?.dataset.blockId ?? null,
            button: event.target.closest?.('button')?.textContent?.trim() ?? null })
        })
        window.probe.editor = createEditor({ holder, injectStyles: true, inlineTools: [], defaultBlock: 'paragraph', data: original,
          plugins: source.legacy ? [new paragraph.Paragraph(), new carousel.Carousel(config)] : [paragraph.createParagraphPlugin(), carousel.createCarouselPlugin(config)] })
      }, { source, pixel })
      await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => link.disabled || link.sheet))
      const load = await inspect('load')
      const root = page.locator('.oe-carousel-block')
      await page.evaluate(() => { window.probe.phase = 'edit' })
      await root.locator('.oe-carousel-block__caption').click()
      await page.keyboard.press('End'); await page.keyboard.type('X')
      const edited = await inspect('edit')
      const initial = [
        { id: 'alpha', type: 'image', src: pixel, alt: 'Alpha image', caption: 'Alpha' },
        { id: 'bravo', type: 'video', src: origin + '/media/probe.webm', poster: pixel, alt: 'Bravo video', caption: 'Bravo' },
        { id: 'charlie', type: 'html', html: '<p>Charlie HTML</p>', caption: 'Charlie' },
      ]
      const editedSlides = structuredClone(initial); editedSlides[0].caption = 'AlphaX'
      check('load', 'slideRecords', load.blocks[1].data.slides.map(shape), initial.map(shape))
      check('edit', 'slideRecords', edited.blocks[1].data.slides.map(shape), editedSlides.map(shape))
      await page.evaluate(() => { window.probe.phase = 'append' })
      await root.getByRole('button', { name: 'Add', exact: true }).click()
      await root.getByRole('button', { name: action === 'batch' ? 'Append proof slides' : action.toUpperCase(), exact: true }).click()
      if (action !== 'batch') {
        const surface = root.locator('.oe-source-editor:not([aria-hidden="true"])')
        await surface.locator('.oe-source-editor__field').click()
        await page.keyboard.type(action === 'url' ? origin + '/media/added.png' : '<p>Added HTML</p>')
        await surface.locator('button[type="submit"]').click()
      }
      const appended = await inspect('append')
      let added
      if (action === 'batch') added = [
        { id: 'delta', type: 'video', src: origin + '/media/probe.webm', poster: pixel, alt: 'Delta video', caption: 'Delta' },
        { id: 'echo', type: 'html', html: '<p>Echo HTML</p>', caption: 'Echo' },
      ]
      else {
        const id = appended.blocks[1].data.slides[3]?.id
        check('append', 'generatedId', typeof id === 'string' && id.length > 0 && !initial.some(slide => slide.id === id), true)
        added = [action === 'url' ? { id, type: 'image', src: origin + '/media/added.png', alt: '', caption: '' } : { id, type: 'html', html: '<p>Added HTML</p>', caption: '' }]
      }
      const appendedSlides = [...editedSlides, ...added]
      check('append', 'slideRecords', appended.blocks[1].data.slides.map(shape), appendedSlides.map(shape))
      check('append', 'activeCounter', appended.counter, '4 / ' + appendedSlides.length)
      check('append', 'activeCaption', appended.activeCaption, action === 'batch' ? 'Delta' : '')
      for (const [phase, key, expected] of [
        ['undo-action', 'Control+z', editedSlides], ['undo-edit', 'Control+z', initial],
        ['redo-edit', 'Control+Shift+z', editedSlides], ['redo-action', 'Control+Shift+z', appendedSlides],
      ]) {
        await page.evaluate(value => { window.probe.phase = value }, phase)
        await page.keyboard.press(key)
        const result = await inspect(phase)
        check(phase, 'slideRecords', result.blocks[1].data.slides.map(shape), expected.map(shape))
      }
      for (const phase of entry.phases) {
        check(phase.phase, 'neighbors', phase.blocks.filter(block => block.type === 'paragraph').map(block => [block.id, block.data.text]), [['before', 'Before'], ['after', 'After']])
        check(phase.phase, 'callerInputUnchanged', phase.inputUnchanged, true)
      }
      entry.events = await page.evaluate(() => window.probe.events)
      check('edit', 'trustedInput', entry.events.filter(event => event.phase === 'edit' && event.type === 'input').map(event => [event.trusted, event.inputType, event.data]), [[true, 'insertText', 'X']])
      check('history', 'trustedShortcuts', entry.events.filter(event => event.type === 'keydown' && event.key?.toLowerCase() === 'z').map(event => event.trusted), [true, true, true, true])
      check('append', 'sourceCalls', await page.evaluate(() => window.probe.calls), action === 'batch' ? 1 : 0)
      await page.evaluate(() => window.probe.editor.destroy())
      check('dispose', 'holderReleased', await page.evaluate(() => window.probe.holder.childElementCount), 0)
    } catch (error) { entry.executionError = error.stack ?? String(error) }
    finally { await page.close() }
    entry.failures = entry.observations.filter(observation => observation.status === 'FAIL')
  }
  for (const { path, bytes } of loaded.values()) assert.deepEqual(await readFile(path), bytes, 'Source changed during probe: ' + path)
  assert.deepEqual(await readFile(new URL(import.meta.url)), scriptBytes)
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), headBefore)
  console.log(JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), node: process.version, browser: await browser.version(),
    headBefore, sourceUnchanged: true, sourceIdentityVerified: serverErrors.length === 0, scriptSha256: digest(scriptBytes),
    mediaSha256: digest(videoBytes), sources, dependencyFiles, dependencyVersions, serverErrors, results }, null, 2))
  if (serverErrors.length || results.some(entry => entry.source === 'candidate' && (entry.failures.length || entry.executionError || entry.pageErrors.length))) process.exitCode = 1
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
