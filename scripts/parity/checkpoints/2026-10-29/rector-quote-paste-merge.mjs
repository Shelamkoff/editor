// Bounded BLOCK_QUOTE_PASTE_MERGE differential. Production modules are served
// byte-for-byte from the pinned trees; only the fixture adapts public API and
// document-envelope spelling. Run with node; JSON is written to stdout.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const startedAt = new Date().toISOString()
const fixtureSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex')
const { chromium } = await import(process.env.EDITOR_PLAYWRIGHT_PATH
  ?? '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const git = (...args) => execFileSync('git', args, { cwd: repo })
const sources = [
  { label: 'v1', sha: '5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340', root: process.env.EDITOR_V1_ROOT ?? '/tmp/rector-v1-5e5c7f8' },
  { label: 'spec-baseline', sha: 'e981ff308000c1d92d7e820df95113c1e19bcee8', root: process.env.EDITOR_SPEC_BASELINE_ROOT ?? '/tmp/rector-e981ff3' },
  { label: 'candidate', sha: git('rev-parse', 'HEAD').toString().trim(), root: repo },
].map(source => ({ ...source, loaded: {} }))
const imports = { dompurify: '/node_modules/dompurify/dist/purify.es.mjs' }
const dependencies = {}
for (const name of ['event-bus', 'color-picker']) {
  const id = '@shelamkoff/' + name
  const manifest = JSON.parse(await readFile(join(repo, 'node_modules', id, 'package.json'), 'utf8'))
  imports[id] = '/node_modules/' + id + '/' + manifest.exports['.'].import.replace(/^\.\//, '')
  dependencies[id] = manifest.version
}
dependencies.dompurify = JSON.parse(await readFile(join(repo, 'node_modules/dompurify/package.json'), 'utf8')).version
const served = new Map()
const serverErrors = []
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    response.setHeader('content-type', /\.m?js$/.test(pathname) ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html')
    if (pathname === '/') {
      response.end('<!doctype html><script type="importmap">' + JSON.stringify({ imports }) + '</script><title>Quote parity</title>')
      return
    }
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return }
    if (!served.has(pathname)) {
      const source = sources.find(value => pathname.startsWith('/' + value.label + '/'))
      assert(source || pathname.startsWith('/node_modules/'), 'Unexpected fixture URL: ' + pathname)
      const relative = source ? pathname.slice(source.label.length + 2) : pathname.slice(1)
      const root = source?.root ?? repo
      const path = resolve(root, relative)
      assert(path.startsWith(resolve(root) + '/'), 'Fixture URL escaped its source root')
      const bytes = await readFile(path)
      if (source) {
        assert.deepEqual(bytes, git('show', `${source.sha}:${relative}`), `${source.label}/${relative} differs from pinned Git`)
        source.loaded[relative] = createHash('sha256').update(bytes).digest('hex')
      }
      served.set(pathname, bytes)
    }
    response.end(served.get(pathname))
  } catch (error) {
    serverErrors.push(String(error))
    response.statusCode = 500
    response.end(String(error))
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({
  executablePath: process.env.EDITOR_CHROME_PATH ?? '/tmp/rector-browsers/chrome-linux64/chrome',
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const results = []
const html = '<blockquote><b>Quoted</b><cite><i>First</i></cite></blockquote>'
  + '<blockquote><i>Second quote</i><footer><s>Second</s></footer></blockquote>'
  + '<blockquote><s>Third quote</s><figcaption><code>Third</code></figcaption></blockquote>'
const imported = [
  { text: '<b>Quoted</b>', caption: '<i>First</i>' },
  { text: '<i>Second quote</i>', caption: '<s>Second</s>' },
  { text: '<s>Third quote</s>', caption: '<code>Third</code>' },
]
const captionCases = [
  ['both captions', '<i>First</i>', '<s>Second</s>', '<i>First</i><br><s>Second</s>'],
  ['target caption only', '<i>First</i>', '', '<i>First</i>'],
  ['source caption only', '', '<s>Second</s>', '<s>Second</s>'],
]

try {
  for (const source of sources) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.stack ?? String(error)))
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.evaluate(async label => {
      const { createEditor } = await import('/' + label + '/core/index.js')
      const paragraphModule = await import('/' + label + '/plugins/paragraph/index.js')
      const quoteModule = await import('/' + label + '/plugins/quote/index.js')
      const legacy = label === 'v1'
      const paragraph = () => legacy ? new paragraphModule.Paragraph({ injectStyles: false }) : paragraphModule.createParagraphPlugin({ injectStyles: false })
      const quote = () => legacy ? new quoteModule.Quote({ injectStyles: false }) : quoteModule.createQuotePlugin({ injectStyles: false })
      let holder, editor, neighbors, copySource
      let trusted = []
      const record = (id, type, data) => ({ id, type, ...(!legacy ? { dataVersion: type === 'paragraph' ? 2 : 1 } : {}), data })
      const block = id => holder.querySelector(`[data-block-id="${id}"]`)
      const field = (id, key) => block(id).querySelector(key === 'paragraph' ? '[contenteditable="true"]' : '.oe-quote__' + key)
      const point = (element, offset) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        let remaining = offset
        while (walker.nextNode()) {
          if (remaining <= walker.currentNode.length) return [walker.currentNode, remaining]
          remaining -= walker.currentNode.length
        }
        if (offset === 0) return [element, 0]
        throw new Error('Fixture offset is outside its text')
      }
      const nativePoint = (node, offset) => {
        const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
        const host = element?.closest('[contenteditable="true"]')
        if (!host || !holder.contains(host)) return null
        const range = document.createRange()
        range.selectNodeContents(host)
        range.setEnd(node, offset)
        const fragment = range.cloneContents()
        return {
          id: host.closest('[data-block-id]').dataset.blockId,
          field: host.classList.contains('oe-quote__caption') ? 'caption' : host.classList.contains('oe-quote__text') ? 'text' : 'paragraph',
          offset: fragment.textContent.length + fragment.querySelectorAll('br').length,
        }
      }
      const range = () => {
        const native = getSelection()
        return { anchor: nativePoint(native.anchorNode, native.anchorOffset), focus: nativePoint(native.focusNode, native.focusOffset),
          active: document.activeElement?.closest('[data-block-id]')?.dataset.blockId ?? null,
          activeField: document.activeElement?.className ?? '', collapsed: native.isCollapsed }
      }
      window.quoteProbe = {
        reset(kind, leftCaption = '<i>First</i>', rightCaption = '<s>Second</s>') {
          editor?.destroy(); holder?.remove(); copySource?.remove()
          holder = document.createElement('section'); document.body.append(holder)
          const middle = kind === 'paste' ? [record('anchor', 'paragraph', { text: 'Anchor' })]
            : kind === 'convert' ? [record('quote', 'quote', { text: '<b>Alpha</b> &amp; <i>Bravo</i>', caption: '<s>Author</s>' })]
              : kind === 'import' ? [record('quote', 'paragraph', { text: '<b>Alpha</b> &amp; <i>Bravo</i>' })]
              : kind === 'incompatible' ? [record('quote', 'quote', { text: '<b>Alpha</b>', caption: '<i>Author</i>' })]
                : [record('left', 'quote', { text: '<b>Alpha</b>', caption: leftCaption }), record('right', 'quote', { text: '<i>Bravo</i>', caption: rightCaption })]
          editor = createEditor({ holder, injectStyles: false, plugins: [paragraph(), quote()], inlineTools: [],
            data: { version: legacy ? '1.0.5' : '2.0.0', blocks: [record('prefix', 'paragraph', { text: '<b>Before</b>' }), ...middle, record('suffix', 'paragraph', { text: '<i>After</i>' })] } })
          neighbors = ['prefix', 'suffix'].map(id => [id, block(id)])
          trusted = []
          for (const type of ['keydown', 'paste']) holder.addEventListener(type, event => trusted.push({ type, key: event.key, trusted: event.isTrusted }), { capture: true })
        },
        select(id, key, anchor, focus = anchor) {
          const host = field(id, key); host.focus()
          getSelection().setBaseAndExtent(...point(host, anchor), ...point(host, focus))
          const value = range()
          if (value.anchor?.offset !== anchor || value.focus?.offset !== focus) throw new Error('Directed fixture selection was not established')
        },
        clipboard(html) {
          copySource = document.createElement('textarea'); copySource.value = 'External Quote provider'; document.body.append(copySource)
          copySource.addEventListener('copy', event => {
            trusted.push({ type: 'copy', trusted: event.isTrusted })
            event.clipboardData.setData('text/html', html)
            event.clipboardData.setData('text/plain', 'Plain fallback must not replace a claimed Quote')
            event.preventDefault()
          }, { once: true })
          copySource.focus(); copySource.select()
        },
        finishCopy() { copySource.remove(); copySource = null },
        convert(type = 'paragraph') { if (legacy) editor.blocks.convert(1, type); else editor.blocks.convert('quote', { type }) },
        historyFocus() { holder.querySelector('.oe-editor').focus({ preventScroll: true }) },
        export() {
          const data = editor.save().blocks.find(block => block.id === 'quote').data
          const input = JSON.stringify(data)
          const definition = quote()
          const payload = legacy ? definition.exportData(block('quote').querySelector('.oe-quote')) : definition.capabilities.conversion.export(data)
          if (JSON.stringify(data) !== input) throw new Error('Export mutated its input data')
          return payload
        },
        snapshot() {
          return { blocks: editor.save().blocks, range: range(), canUndo: editor.canUndo, canRedo: editor.canRedo,
            neighborsRetained: neighbors.every(([id, element]) => block(id) === element), trusted: [...trusted],
            quoteDom: [...holder.querySelectorAll('.oe-quote')].map(element => ({ text: element.querySelector('.oe-quote__text').innerHTML, caption: element.querySelector('.oe-quote__caption').innerHTML })) }
        },
      }
    }, source.label)
    const cases = []
    const snapshot = () => page.evaluate(() => quoteProbe.snapshot())
    const press = async key => {
      await page.keyboard.press(key)
      await page.waitForTimeout(40)
      // v1 keeps a retired block shell mounted until its normal removal
      // animation finishes. Observe the completed gesture without changing
      // animation policy or filtering a ghost out of the DOM assertion.
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined)))
        await new Promise(resolve => requestAnimationFrame(resolve))
      })
    }
    const same = (actual, expected, message) => assert.deepEqual(actual, expected, `${source.label}: ${message}`)
    const semantic = blocks => blocks.map(block => ({ id: block.id, type: block.type, data: block.data }))
    async function replay(before, after, hostCommand = false) {
      if (hostCommand) await page.evaluate(() => quoteProbe.historyFocus())
      await press('Control+z')
      const undo = await snapshot()
      same(undo.blocks, before.blocks, 'one Undo must restore the exact source records')
      same([undo.canUndo, undo.canRedo], [false, true], 'one semantic action must use exactly one history entry')
      if (source.label !== 'v1') same(undo.range, before.range, 'Undo must restore the original directed author interval')
      await press('Control+Shift+z')
      const redo = await snapshot()
      same(redo.blocks, after.blocks, 'Redo must preserve payloads, order and generated identities')
      same([redo.canUndo, redo.canRedo], [true, false], 'Redo history shape differs')
      if (source.label === 'candidate') {
        same([after.neighborsRetained, undo.neighborsRetained, redo.neighborsRetained], [true, true, true], 'unrelated block DOM must remain mounted')
        if (!hostCommand) same(redo.range, after.range, 'Redo must restore the completed gesture interval')
      }
      return { undo, redo }
    }
    function neighbors(before, after) {
      same(after.blocks.find(block => block.id === 'prefix'), before.blocks[0], 'preceding record changed')
      same(after.blocks.find(block => block.id === 'suffix'), before.blocks.at(-1), 'following record changed')
      same(after.neighborsRetained, true, 'ordinary gesture remounted an unrelated neighbor')
    }
    async function scenario(name, run) {
      const observed = { name }
      try { await run(observed); observed.status = 'PASS' }
      catch (error) { observed.status = 'FAIL'; observed.error = error.stack ?? String(error) }
      cases.push(observed)
      console.error(`${source.label}: ${observed.status} ${name}`)
    }
    for (const backwards of [false, true]) {
      await scenario(`system clipboard structural paste / ${backwards ? 'backward' : 'forward'}`, async observed => {
        await page.evaluate(html => { quoteProbe.reset('paste'); quoteProbe.clipboard(html) }, html)
        await press('Control+c')
        await page.evaluate(backwards => { quoteProbe.finishCopy(); quoteProbe.select('anchor', 'paragraph', backwards ? 4 : 1, backwards ? 1 : 4) }, backwards)
        observed.before = await snapshot()
        await press('Control+v')
        observed.after = await snapshot()
        const { before, after } = observed
        same(after.blocks.map(block => block.type), ['paragraph', 'paragraph', 'quote', 'quote', 'quote', 'paragraph'], 'claimed HTML routing differs')
        same(after.blocks[1], before.blocks[1], 'structural paste must preserve the existing selected target text')
        const expected = source.label === 'spec-baseline' ? [
          { text: '<b>Quoted</b><i>First</i>', caption: '' },
          { text: '<i>Second quote</i><s>Second</s>', caption: '' },
          { text: '<s>Third quote</s><code>Third</code>', caption: '' },
        ] : imported
        same(after.blocks.slice(2, 5).map(block => block.data), expected, 'rich quotation/attribution payload differs')
        same(after.quoteDom, expected, 'rendered Quote fields do not match saved rich data')
        same(new Set(after.blocks.map(block => block.id)).size, 6, 'paste reused an existing ID')
        if (source.label === 'candidate') same(after.range.anchor, { id: after.blocks[4].id, field: 'text', offset: 11 }, 'paste must finish at the end of the final quotation field')
        same(after.trusted.filter(event => event.type === 'copy' || event.type === 'paste').map(event => [event.type, event.trusted]), [['copy', true], ['paste', true]], 'clipboard roundtrip was not native')
        neighbors(before, after)
        if (source.label === 'spec-baseline') observed.difference = 'Existing baseline defect: nested attribution flattened into quotation; candidate restores the v1 separate rich caption.'
        Object.assign(observed, await replay(before, after))
      })
    }
    for (const [captionCase, left, right, merged] of captionCases) for (const key of ['Backspace', 'Delete']) {
      await scenario(`${key} compatible merge / ${captionCase}`, async observed => {
        const offset = left ? 5 : 0
        await page.evaluate(({ left, right, key, offset }) => {
          quoteProbe.reset('merge', left, right)
          quoteProbe.select(key === 'Backspace' ? 'right' : 'left', key === 'Backspace' ? 'text' : 'caption', key === 'Backspace' ? 0 : offset)
        }, { left, right, key, offset })
        observed.before = await snapshot(); await press(key); observed.after = await snapshot()
        const { before, after } = observed
        const caption = source.label === 'v1' ? left : merged
        same(after.blocks, [before.blocks[0], { ...before.blocks[1], data: { text: '<b>Alpha</b><i>Bravo</i>', caption } }, before.blocks[3]], 'merge lost rich fields, target identity or untouched records')
        same(after.quoteDom, [{ text: '<b>Alpha</b><i>Bravo</i>', caption }], 'merge changed rendered formatting')
        neighbors(before, after)
        if (source.label === 'candidate') same(after.range.anchor, { id: 'left', field: 'caption', offset }, 'merge did not retain the prior target caption boundary')
        if (source.label === 'v1' && right) observed.difference = 'Repaired v1 loss: merge discarded the incoming caption. Candidate retains both author captions in order.'
        Object.assign(observed, await replay(before, after))
        if (source.label === 'spec-baseline' && JSON.stringify(after.range) !== JSON.stringify(observed.redo.range)) observed.caretDifference = 'Existing baseline focus defect: immediate Backspace caret differs from its recorded Redo boundary; candidate immediate/replay intervals agree.'
      })
    }
    for (const key of ['Backspace', 'Delete']) {
      await scenario(`${key} incompatible neighbor`, async observed => {
        await page.evaluate(key => { quoteProbe.reset('incompatible'); quoteProbe.select('quote', key === 'Backspace' ? 'text' : 'caption', key === 'Backspace' ? 0 : 6) }, key)
        observed.before = await snapshot(); await press(key); observed.after = await snapshot()
        same(observed.after.blocks, observed.before.blocks, 'incompatible neighbor was consumed')
        same(observed.after.canUndo, false, 'rejected merge created history')
        same(observed.after.range, observed.before.range, 'rejected merge changed selection')
        neighbors(observed.before, observed.after)
      })
    }
    for (const [key, id, field, offset] of [['Backspace', 'right', 'caption', 0], ['Delete', 'left', 'text', 5]]) {
      await scenario(`${key} internal field boundary`, async observed => {
        await page.evaluate(({ id, field, offset }) => { quoteProbe.reset('merge'); quoteProbe.select(id, field, offset) }, { id, field, offset })
        observed.before = await snapshot(); await press(key); observed.after = await snapshot()
        same(observed.after.blocks, observed.before.blocks, 'internal field boundary merged entire Quotes')
        same(observed.after.canUndo, false, 'internal field boundary created history')
        same(observed.after.range, observed.before.range, 'internal field boundary moved the caret')
      })
    }
    for (const backwards of [false, true]) {
      await scenario(`export and whole Paragraph conversion / ${backwards ? 'backward' : 'forward'}`, async observed => {
        await page.evaluate(backwards => { quoteProbe.reset('convert'); quoteProbe.select('quote', 'caption', backwards ? 5 : 1, backwards ? 1 : 5) }, backwards)
        observed.before = await snapshot()
        observed.exported = await page.evaluate(() => quoteProbe.export())
        const expectedText = source.label === 'v1' ? '<b>Alpha</b> &amp; <i>Bravo</i>' : '<b>Alpha</b> &amp; <i>Bravo</i><br><s>Author</s>'
        same(observed.exported, source.label === 'v1' ? { text: '<b>Alpha</b> &amp; <i>Bravo</i>', caption: '<s>Author</s>' } : { kind: 'rich-text', data: { text: expectedText } }, 'public export lost rich author fields')
        same(await snapshot(), observed.before, 'export mutated model, selection or history')
        await page.evaluate(() => quoteProbe.convert()); observed.after = await snapshot()
        const { before, after } = observed
        same(semantic(after.blocks), [semantic(before.blocks)[0], { id: 'quote', type: 'paragraph', data: { text: expectedText } }, semantic(before.blocks).at(-1)], 'whole conversion changed transferable marks, stable identity or neighbors')
        neighbors(before, after)
        if (source.label === 'v1') observed.difference = 'Approved C2 difference (2026-10-04): whole conversion keeps every author field in candidate; v1 Paragraph consumed text and discarded exported caption.'
        Object.assign(observed, await replay(before, after, true))
      })
    }
    for (const backwards of [false, true]) {
      await scenario(`rich Paragraph conversion into Quote / ${backwards ? 'backward' : 'forward'}`, async observed => {
        await page.evaluate(backwards => { quoteProbe.reset('import'); quoteProbe.select('quote', 'paragraph', backwards ? 5 : 1, backwards ? 1 : 5) }, backwards)
        observed.before = await snapshot()
        await page.evaluate(() => quoteProbe.convert('quote')); observed.after = await snapshot()
        const { before, after } = observed
        same(semantic(after.blocks), [semantic(before.blocks)[0], { id: 'quote', type: 'quote', data: { text: '<b>Alpha</b> &amp; <i>Bravo</i>', caption: '' } }, semantic(before.blocks).at(-1)], 'conversion into Quote lost rich text, invented a caption or changed identity/order')
        same(after.quoteDom, [{ text: '<b>Alpha</b> &amp; <i>Bravo</i>', caption: '' }], 'import changed rendered rich text')
        neighbors(before, after)
        Object.assign(observed, await replay(before, after, true))
      })
    }
    same(errors, [], 'unexpected browser event errors')
    results.push({ label: source.label, sha: source.sha, cases })
    await page.close()
  }
  assert.deepEqual(serverErrors, [], 'A source-integrity or fixture-server error occurred')
  for (const source of sources) for (const [path, hash] of Object.entries(source.loaded)) {
    assert.equal(createHash('sha256').update(await readFile(join(source.root, path))).digest('hex'), hash, `Source changed during the run: ${source.label}/${path}`)
  }
  console.log(JSON.stringify({ scenario: 'BLOCK_QUOTE_PASTE_MERGE', startedAt, finishedAt: new Date().toISOString(), fixtureSha256,
    repositoryHeadAtEnd: git('rev-parse', 'HEAD').toString().trim(), sourceModulesUnchanged: true,
    browser: await browser.version(), dependencies,
    policy: { sourceModules: 'Unmodified bytes checked against Git on every first served source request',
      boundaries: ['public createEditor', 'trusted system Copy/Paste', 'trusted Backspace/Delete', 'public plugin export', 'public blocks.convert', 'trusted single Undo/Redo'],
      v1Differences: ['incoming merge caption loss repaired', 'whole conversion author-field retention approved in C2', 'v1 history may collapse a directed selection and remount blocks; candidate asserts exact interval and unaffected DOM reuse'],
      limits: ['This bounded row does not accept all BLOCK_QUOTE_FIELDS or ROUNDTRIP cases', 'HTML is supplied by a controlled external clipboard producer; actual trusted Copy/Paste transfers it through the system clipboard'] },
    sources: sources.map(({ root, ...source }) => source), results,
    candidatePassed: results.find(result => result.label === 'candidate').cases.every(result => result.status === 'PASS'),
  }, null, 2))
  if (results.some(source => source.cases.some(result => result.status === 'FAIL'))) process.exitCode = 1
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
