import './embedded-html-acquisition-fixture.js'
import { createEditor } from '../../core/index.js'
import { createParagraphPlugin } from '../../plugins/paragraph/index.js'
import { createRawPlugin } from '../../plugins/raw/index.js'
import { createCarouselPlugin } from '../../plugins/carousel/index.js'
import { EditorRenderer } from '../../renderer/index.js'
import { createRawRenderer } from '../../renderer/renderers/raw/index.js'
import { test, assert, equal, pause, run } from './regressions/harness.js'
import { waitForEmbeddedDocument } from './embedded-html-helpers.js'

test('editor and renderer reject invalid application stylesheet collections before acquisition', () => {
  for (const value of [null, {}, 'body{color:red}', [7], Array(1)]) {
    const holder = document.createElement('div'); document.body.append(holder)
    try {
      for (const create of [
        () => createEditor({ holder, plugins: [createParagraphPlugin()], injectStyles: false, contentStyles: value }),
        () => new EditorRenderer({ injectStyles: false, blockTypes: [], contentStyles: value }),
      ]) {
        let failure
        try { const result = create(); result.destroy() } catch (error) { failure = error }
        assert(failure instanceof TypeError && /contentStyles/.test(failure.message), 'Invalid contentStyles escaped configuration validation')
      }
    } finally { holder.remove() }
  }
})

test('editor snapshots application stylesheet getters once before extension setup', () => {
  const holder = document.createElement('div'); document.body.append(holder)
  const css = '.article-accent{color:rgb(12,84,156)}'
  const source = [], paragraph = createParagraphPlugin({ injectStyles: false })
  let reads = 0, supplied
  Object.defineProperty(source, '0', { configurable: true, get() { reads++; return css } })
  source.length = 1
  let editor
  try {
    editor = createEditor({ holder, injectStyles: false, contentStyles: source, plugins: [{
      ...paragraph,
      setup(context) {
        supplied = context.contentStyles
        Object.defineProperty(source, '0', { value: 'body{display:none}', configurable: true })
        source.push('body{color:red}')
        return paragraph.setup(context)
      },
    }] })
    equal(reads, 1)
    equal(supplied, [css])
    assert(Object.isFrozen(supplied) && supplied !== source)
    editor.setReadOnly(true); editor.setReadOnly(false)
    equal(supplied, [css])
  } finally { editor?.destroy(); holder.remove() }
})

test('renderer retains immutable configured content styles across output routes and owner realms', () => {
  const css = '.article-accent{color:rgb(12,84,156)}', source = [css], seen = []
  const renderer = new EditorRenderer({ blockTypes: [], injectStyles: false, contentStyles: source })
  renderer.registerRenderer({
    ...createRawRenderer('check', {}),
    render(block, _parse, context) {
      seen.push(context.contentStyles)
      const element = context.ownerDocument.createElement('section'); element.textContent = block.data.html; return element
    },
  })
  source[0] = 'body{display:none}'; source.push('body{color:red}')
  const frame = document.createElement('iframe'), holder = document.createElement('div')
  document.body.append(frame, holder)
  const block = { id: 'raw', type: 'raw', dataVersion: 1, data: { html: '<p>Source</p>' } }
  const data = { version: '2.0.0', blocks: [block] }
  try {
    const detached = renderer.renderBlock(block)
    renderer.render(data)
    renderer.renderTo(data, holder)
    const foreign = frame.contentDocument.createElement('div'); frame.contentDocument.body.append(foreign)
    renderer.renderTo(data, foreign)
    assert(detached.ownerDocument === document)
    assert(foreign.firstElementChild.ownerDocument === frame.contentDocument)
    assert(seen.length >= 4)
    for (const styles of seen) {
      equal(styles, [css]); assert(Object.isFrozen(styles) && styles !== source)
    }
  } finally { renderer.destroy(); holder.remove(); frame.remove() }
})

test('omitted content style input supplies an immutable empty collection', () => {
  const holder = document.createElement('div'); document.body.append(holder)
  const paragraph = createParagraphPlugin({ injectStyles: false })
  let supplied, editor
  try {
    editor = createEditor({ holder, injectStyles: false, plugins: [{ ...paragraph, setup(context) { supplied = context.contentStyles; return paragraph.setup(context) } }] })
    equal(supplied, []); assert(Object.isFrozen(supplied))
  } finally { editor?.destroy(); holder.remove() }
})

test('Raw renderer uses the owned content boundary and explicit styles without changing author HTML', async () => {
  const css = 'html,body{margin:0}body{display:flow-root;font:20px sans-serif}.article-accent{color:rgb(12,84,156);font-size:1.5em}'
  const html = '<p class="article-accent">Styled content</p><div style="height:calc(100vh + 20px)">Tall flow</div>'
  const renderer = new EditorRenderer({ blockTypes: ['raw'], injectStyles: false, contentStyles: [css] })
  const block = { id: 'raw', type: 'raw', dataVersion: 1, data: { html } }, before = structuredClone(block)
  let output
  try {
    output = renderer.renderBlock(block); document.body.append(output)
    const frame = output.querySelector('iframe')
    assert(frame, 'Raw renderer did not install the selected frame boundary')
    equal(frame.getAttribute('sandbox'), 'allow-same-origin')
    const deadline = performance.now() + 3000
    while (!frame.contentDocument?.querySelector('.article-accent')) {
      assert(performance.now() < deadline, 'Owned HTML was not projected'); await pause(10)
    }
    await pause(40)
    const view = frame.contentWindow, paragraph = frame.contentDocument.querySelector('.article-accent')
    equal(view.getComputedStyle(paragraph).fontSize, '30px')
    equal(view.getComputedStyle(paragraph).color, 'rgb(12, 84, 156)')
    assert(frame.getBoundingClientRect().height > innerHeight + 20)
    equal(block, before)
    renderer.destroy(output)
    equal(output.querySelector('iframe'), null)
  } finally { renderer.destroy(); output?.remove() }
})

test('Raw editor preview retains explicit theme and coherent update/history lifetimes', async () => {
  const holder = document.createElement('div'); document.body.append(holder)
  const html = '<p class="article-accent">Original preview</p>', next = '<p class="article-accent">Updated preview</p>'
  const css = 'html,body{margin:0}body{display:flow-root}.article-accent{font-size:30px;color:rgb(12,84,156)}'
  let editor
  const presented = async expected => {
    const frame = holder.querySelector('iframe')
    assert(frame, 'Raw preview lost its frame')
    equal(frame.getAttribute('sandbox'), 'allow-same-origin')
    const deadline = performance.now() + 3000
    while (frame.contentDocument?.querySelector('.article-accent')?.textContent !== expected) {
      assert(performance.now() < deadline, 'Raw preview did not publish the current source'); await pause(10)
    }
    const paragraph = frame.contentDocument.querySelector('.article-accent')
    equal(frame.contentWindow.getComputedStyle(paragraph).color, 'rgb(12, 84, 156)')
    return frame
  }
  try {
    editor = createEditor({ holder, plugins: [createRawPlugin({ injectStyles: false })], readOnly: true,
      injectStyles: false, contentStyles: [css], data: { version: '2.0.0', blocks: [{ id: 'raw', type: 'raw', dataVersion: 1, data: { html } }] } })
    const initial = await presented('Original preview')
    equal(editor.save().blocks[0].data.html, html)
    editor.setReadOnly(false)
    editor.blocks.update('raw', current => ({ data: { ...current.data, html: next } }))
    await presented('Updated preview')
    assert(!initial.isConnected)
    assert(editor.undo()); await presented('Original preview')
    equal(editor.save().blocks[0].data.html, html)
    assert(editor.redo()); await presented('Updated preview')
    equal(editor.save().blocks[0].data.html, next)
    editor.destroy()
    equal(holder.querySelector('iframe'), null)
  } finally { editor?.destroy(); holder.remove() }
})

test('HTML Carousel editor and renderer share the styled confined boundary and retire replacement views', async () => {
  const holder = document.createElement('div'), target = document.createElement('div')
  holder.style.width = target.style.width = '600px'; document.body.append(holder, target)
  const html = '<p class="article-accent">Carousel HTML</p><div style="height:900px">Long slide</div>'
  const css = 'html,body{margin:0}body{display:flow-root}.article-accent{font-size:30px;color:rgb(12,84,156)}'
  const data = { version: '2.0.0', blocks: [{ id: 'carousel', type: 'carousel', dataVersion: 1,
    data: { slides: [{ id: 'html', type: 'html', html, caption: '' }], options: {
      loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false,
    } } }] }
  const before = structuredClone(data)
  let editor, renderer
  const presented = async root => {
    const frame = root.querySelector('iframe')
    assert(frame, 'HTML slide did not acquire the selected content boundary')
    equal(frame.getAttribute('sandbox'), 'allow-same-origin')
    const deadline = performance.now() + 3000
    while (!frame.contentDocument?.querySelector('.article-accent')) {
      assert(performance.now() < deadline, 'HTML slide source did not settle'); await pause(10)
    }
    await pause(40)
    equal(frame.contentWindow.getComputedStyle(frame.contentDocument.querySelector('.article-accent')).color, 'rgb(12, 84, 156)')
    assert(frame.getBoundingClientRect().height > 900)
    return frame
  }
  try {
    editor = createEditor({ holder, plugins: [createCarouselPlugin({ injectStyles: false })], readOnly: true,
      injectStyles: false, contentStyles: [css], data })
    const old = await presented(holder)
    editor.setReadOnly(false)
    await presented(holder); assert(!old.isConnected)
    renderer = new EditorRenderer({ blockTypes: ['carousel'], injectStyles: false, contentStyles: [css] })
    renderer.renderTo(data, target); const prior = await presented(target)
    renderer.renderTo({ ...data, blocks: [{ ...data.blocks[0], data: { ...data.blocks[0].data, slides: [] } }] }, target)
    assert(!prior.isConnected)
    equal(target.querySelector('iframe'), null)
    const saved = editor.save()
    equal({ version: saved.version, blocks: saved.blocks }, data); equal(data, before)
  } finally { editor?.destroy(); renderer?.destroy(); holder.remove(); target.remove() }
})

test('a detached Raw result acquires the actual owner realm on its first mount', async () => {
  const outer = document.createElement('iframe'); document.body.append(outer)
  const renderer = new EditorRenderer({ blockTypes: ['raw'], injectStyles: false,
    contentStyles: ['.article-accent{color:rgb(12,84,156)}'] })
  let output
  try {
    output = renderer.renderBlock({ id: 'raw', type: 'raw', dataVersion: 1, data: { html: '<p class="article-accent">Adopted source</p>' } })
    outer.contentDocument.body.append(output)
    const frame = output.querySelector('iframe'), deadline = performance.now() + 3000
    while (!frame.contentDocument?.querySelector('.article-accent')) {
      assert(performance.now() < deadline, 'First mount borrowed the original creation realm'); await pause(10)
    }
    assert(output.ownerDocument === outer.contentDocument)
    equal(frame.contentWindow.getComputedStyle(frame.contentDocument.querySelector('p')).color, 'rgb(12, 84, 156)')
  } finally { renderer.destroy(); output?.remove(); outer.remove() }
})

test('replacing the initial Raw document before admission cannot acquire the original source', async () => {
  const renderer = new EditorRenderer({ blockTypes: ['raw'], injectStyles: false })
  let output
  try {
    output = renderer.renderBlock({ id: 'raw', type: 'raw', dataVersion: 1, data: { html: '<p>Original source</p>' } })
    const frame = output.querySelector('iframe')
    frame.removeAttribute('srcdoc'); frame.src = 'about:blank'
    document.body.append(output)
    await pause(100)
    equal(output.querySelector('iframe'), null)
  } finally { renderer.destroy(); output?.remove() }
})

test('logical viewport dimensions use the configured root writing mode on first presentation', async () => {
  const renderer = new EditorRenderer({ blockTypes: ['raw'], injectStyles: false,
    contentStyles: ['html{writing-mode:vertical-rl}body{margin:0}#proof{height:10vi;width:10vb}'] })
  let output
  try {
    output = renderer.renderBlock({ id: 'raw', type: 'raw', dataVersion: 1, data: { html: '<div id="proof">Vertical</div>' } })
    document.body.append(output)
    const childDocument = await waitForEmbeddedDocument(output.querySelector('iframe'), document => document.querySelector('#proof'))
    const box = childDocument.querySelector('#proof').getBoundingClientRect()
    assert(Math.abs(box.height - innerHeight / 10) < 1 / 32, 'vi used the horizontal default before applying the content root style')
    assert(Math.abs(box.width - innerWidth / 10) < 1 / 32, 'vb used the horizontal default before applying the content root style')
  } finally { renderer.destroy(); output?.remove() }
})

test('square natural flow preserves inherited logical units and later consumer mode changes', async () => {
  const renderer = new EditorRenderer({ blockTypes: ['raw'], injectStyles: false, contentStyles: [
    'html{--logical:10vi}body{margin:0;height:600px;overflow:hidden}.sample{width:var(--logical);height:10vb}.vertical{writing-mode:vertical-rl}',
  ] })
  let output
  try {
    const block = { id: 'raw', type: 'raw', dataVersion: 1, data: { html: '<div id="horizontal" class="sample">H</div><div id="vertical" class="sample vertical">V</div>' } }
    const before = structuredClone(block)
    output = renderer.renderBlock(block); output.style.width = '600px'; document.body.append(output)
    const frame = output.querySelector('iframe'), child = await waitForEmbeddedDocument(frame, document => document.querySelector('#horizontal'))
    await pause(60)
    equal(frame.getBoundingClientRect().height, 601, 'Square-axis handling clipped or capped the natural body')
    const check = (id, width, height) => {
      const style = child.defaultView.getComputedStyle(child.getElementById(id))
      assert(Math.abs(parseFloat(style.width) - width) < 1 / 32, `${id} logical width changed`)
      assert(Math.abs(parseFloat(style.height) - height) < 1 / 32, `${id} logical height changed`)
    }
    check('horizontal', innerWidth / 10, innerHeight / 10)
    check('vertical', innerHeight / 10, innerWidth / 10)
    child.getElementById('horizontal').style.writingMode = 'vertical-rl'
    check('horizontal', innerHeight / 10, innerWidth / 10)
    equal(block, before)
  } finally { renderer.destroy(); output?.remove() }
})

for (const [type, editing] of [['raw', true], ['raw', false], ['carousel', true], ['carousel', false]]) {
  test(`${type} ${editing ? 'editor' : 'renderer'}: a failed observer cleanup still aborts content subscriptions`, async () => {
    const NativeObserver = window.ResizeObserver, nativeAdd = MediaQueryList.prototype.addEventListener
    const subscriptions = [], holder = document.createElement('section')
    document.body.append(holder)
    let editor, renderer
    window.ResizeObserver = class extends NativeObserver {
      observe(target, ...options) { this.child = target.ownerDocument !== document; return super.observe(target, ...options) }
      disconnect() { super.disconnect(); if (this.child) throw new Error('Controlled child observer disposal failure') }
    }
    MediaQueryList.prototype.addEventListener = function (name, listener, options) {
      if (name === 'change' && options?.signal) subscriptions.push({ target: this, name, listener, options })
      return nativeAdd.call(this, name, listener, options)
    }
    try {
      const html = '<p>Owned readable content</p>'
      const data = { version: '2.0.0', blocks: [{ id: 'content', type, dataVersion: 1,
        data: type === 'raw' ? { html } : { slides: [{ id: 'html', type: 'html', html, caption: '' }],
          options: { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false } } }] }
      const contentStyles = ['@media(min-width:0px){p{color:red}}']
      if (editing) editor = createEditor({ holder, data, contentStyles, readOnly: true, injectStyles: false,
        plugins: [type === 'raw' ? createRawPlugin({ injectStyles: false }) : createCarouselPlugin({ injectStyles: false })] })
      else { renderer = new EditorRenderer({ blockTypes: [type], contentStyles, injectStyles: false }); renderer.renderTo(data, holder) }
      const frame = holder.querySelector('iframe')
      await waitForEmbeddedDocument(frame)
      assert(subscriptions.length > 0, 'The test did not acquire a real abortable content subscription')
      editor?.destroy(); renderer?.destroy()
      assert(subscriptions.every(({ options }) => options.signal.aborted), 'Observer failure stranded an active parent subscription')
      assert(!frame.isConnected)
    } finally {
      window.ResizeObserver = NativeObserver; MediaQueryList.prototype.addEventListener = nativeAdd
      for (const { target, name, listener, options } of subscriptions) target.removeEventListener(name, listener, options)
      editor?.destroy(); renderer?.destroy(); holder.remove()
    }
  })
}

await run()
