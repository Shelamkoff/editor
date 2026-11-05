const initialUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const nextUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const defaults = { file: { url: '' }, caption: '', withBorder: false, expanded: false, withBackground: false, styles: {} }
const appearance = { width: '180px', minWidth: '120px', maxWidth: '240px', height: '80px', minHeight: '40px',
  maxHeight: '100px', objectFit: 'cover', objectPosition: '20% 30%', borderStyle: 'dashed', borderWidth: '2px',
  borderColor: '#123456', borderRadius: '7px', backgroundColor: '#ffeecc' }
const pause = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms))
const clone = value => structuredClone(value)
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value

export const imageFunctionalCases = [
  ...['local', 'action', 'upload'].flatMap(source => [false, true].map(populated => ({ kind: 'success', source, populated }))),
  ...['action', 'upload'].flatMap(source => [false, true].flatMap(populated =>
    ['error', 'url-race', 'mode'].map(kind => ({ kind, source, populated })))),
  ...[false, true].map(widgets => ({ kind: 'caption', widgets, populated: true })),
  ...[false, true].map(withBackground => ({ kind: 'appearance', withBackground, populated: true })),
  ...[320, 600].flatMap(width => [false, true].map(withBackground => ({ kind: 'expanded', width, withBackground, populated: true }))),
].map((spec, index) => ({ ...spec, id: `${spec.kind}/${index}` }))

export async function runImageFunctionalCase({ spec, sourceBase = '../../', legacy = false, nativeInput }) {
  const base = new URL(sourceBase, import.meta.url)
  const [{ createEditor }, imageModule, { EditorRenderer }, mention, color] = await Promise.all([
    import(new URL('core/index.js', base)), import(new URL('plugins/image/index.js', base)),
    import(new URL('renderer/index.js', base)), import(new URL('inline-plugins/mention/index.js', base)),
    import(new URL('inline-plugins/color.js', base)),
  ])
  const observations = [], phases = [], events = [], requests = [], transactions = [], unsupported = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual: clone(actual), expected: clone(expected),
    status: JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)) ? 'PASS' : 'FAIL' })
  const mark = phase => phases.push(phase)
  const holder = document.createElement('section'), output = document.createElement('section')
  holder.style.width = `${spec.width ?? 600}px`
  document.body.append(holder, output)
  const callback = context => new Promise((resolve, reject) => {
    const entry = { signal: context.signal, settled: false,
      resolve(value) { entry.settled = true; resolve(value) },
      reject(error) { entry.settled = true; reject(error) } }
    requests.push(entry)
  })
  const config = { actions: [{ label: 'Library', handler: callback }],
    ...(spec.source === 'upload' ? { uploadFile: (file, context) => {
      events.push({ kind: 'upload', name: file.name, type: file.type, size: file.size })
      return callback(context)
    } } : {}) }
  const definition = legacy ? new imageModule.Image(config) : imageModule.createImagePlugin(config)
  const widget = (type, data) => ({ type, ...(!legacy ? { dataVersion: 1 } : {}), data })
  const rich = spec.widgets === true
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'image', type: 'image', ...(!legacy ? { dataVersion: 1 } : {}),
    data: { ...clone(defaults), ...(spec.populated ? { file: { url: initialUrl }, caption: '<b>Keep</b>' + (rich ? ' {{mention}} {{color}}' : ''),
      styles: clone(appearance), withBorder: true, withBackground: spec.withBackground === true } : {}) },
    ...(rich ? { inline: { mention: widget('mention', { id: 'ada', name: 'Ada' }), color: widget('color', { value: '#123456' }) } } : {}),
  }] }
  const original = clone(input), expected = clone(input.blocks)
  let editor, renderer, error, phase = 'create'
  const wrapper = () => holder.querySelector('.oe-image')
  const caption = () => wrapper().querySelector('.oe-image__caption')
  const picture = () => wrapper().querySelector('.oe-image__image')
  const button = label => [...wrapper().querySelectorAll('button')].find(element => element.textContent.trim() === label && element.checkVisibility())
  const click = async element => {
    if (!element) throw new Error('Missing live Image control')
    element.scrollIntoView({ block: 'center' })
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) throw new Error('Image control is not visible')
    let trusted = false
    element.addEventListener('click', event => { trusted = event.isTrusted }, { once: true })
    await nativeInput('Input.click', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    events.push({ kind: 'click', trusted })
    if (!trusted) throw new Error('Untrusted Image action')
    await pause()
  }
  const key = async (key, code, value, modifiers = 0) => {
    const params = { key, code, windowsVirtualKeyCode: value, nativeVirtualKeyCode: value, modifiers }
    await nativeInput('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...params })
    await nativeInput('Input.dispatchKeyEvent', { type: 'keyUp', ...params })
    await pause()
  }
  const checkModel = name => {
    check(name, 'blocks', editor.save().blocks, expected)
    check(name, 'caller', input, original)
  }
  const render = name => {
    renderer.renderTo(editor.save(), output)
    const image = output.querySelector('img')
    check(name, 'outputSource', image?.getAttribute('src') ?? '', expected[0].data.file.url)
    const text = rich ? 'Keep @Ada #123456' : 'Keep'
    check(name, 'caption', caption().textContent, expected[0].data.caption ? text + (expected[0].data.caption.endsWith('X') ? 'X' : '') : '')
    check(name, 'outputAlt', image?.alt ?? '', expected[0].data.caption ? text + (expected[0].data.caption.endsWith('X') ? 'X' : '') : '')
  }
  const replay = async (before, after) => {
    phase = 'undo'; wrapper().focus(); await key('z', 'KeyZ', 90, 2)
    check(phase, 'blocks', editor.save().blocks, before)
    check(phase, 'history', [editor.canUndo, editor.canRedo], [false, true]); mark(phase)
    phase = 'redo'; wrapper().focus(); await key('z', 'KeyZ', 90, 10)
    check(phase, 'blocks', editor.save().blocks, after)
    check(phase, 'history', [editor.canUndo, editor.canRedo], [true, false]); mark(phase)
  }
  const openSources = async () => { if (editor.save().blocks[0].data.file.url) await click(button('Replace')) }
  const start = async () => {
    await openSources()
    if (spec.source === 'action') await click(button('Library'))
    else {
      let input
      const previous = HTMLInputElement.prototype.click
      HTMLInputElement.prototype.click = function () { if (this.type === 'file') input = this; else previous.call(this) }
      try { await click(button('Upload') ?? wrapper().querySelector('.oe-image__select-link')) }
      finally { HTMLInputElement.prototype.click = previous }
      if (!input) throw new Error('Image upload did not create its real input')
      const bytes = Uint8Array.from(atob(initialUrl.split(',')[1]), char => char.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'tiny.gif', { type: 'image/gif' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await pause(100)
    return requests.at(-1)
  }
  const setting = label => [...wrapper().querySelectorAll('.oe-image__style-label')]
    .find(element => element.querySelector('span')?.textContent === label)?.querySelector('input')
  const openSettings = async () => { if (button('Settings').getAttribute('aria-expanded') !== 'true') await click(button('Settings')) }
  try {
    editor = createEditor({ holder, plugins: [definition], defaultBlock: 'image', injectStyles: true, inlineTools: [],
      inlinePlugins: [mention.createMentionPlugin({ searchFunction: async () => [] }), color.createColorSwatchPlugin()], data: input })
    renderer = new EditorRenderer({ blockTypes: ['image'], injectStyles: true,
      ...(legacy ? { inlinePlugins: [mention.createMentionWidget(), color.createColorSwatchPlugin()] }
        : { inlineRenderers: [mention.createMentionRenderer(), color.createColorSwatchRenderer()] }) })
    if (!legacy) editor.on('transaction:committed', event => transactions.push({ action: event.action, origin: event.origin }))
    else unsupported.push('currentTransactionObservers')
    const deadline = Date.now() + 5000
    while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.sheet)) {
      if (Date.now() > deadline) throw new Error('Image styles failed to load')
      await pause()
    }
    phase = 'load'; checkModel(phase); check(phase, 'history', [editor.canUndo, editor.canRedo], [false, false]); mark(phase)
    if (['success', 'error', 'url-race', 'mode'].includes(spec.kind)) {
      phase = 'source'; let request = await start()
      if (spec.kind === 'url-race') {
        await openSources()
        await click(button(editor.save().blocks[0].data.file.url ? 'URL' : 'Insert by URL'))
        const root = wrapper().querySelector('.oe-source-editor:not(.oe-source-editor--preloaded)')
        await click(root.querySelector('input'))
        await nativeInput('Input.insertText', { text: nextUrl })
        await click(root.querySelector('[type="submit"]'))
        expected[0].data.file = { url: nextUrl }
        check(phase, 'cancelled', request.signal.aborted, true)
        request.resolve({ url: initialUrl, alt: 'Stale' })
      } else if (spec.kind === 'mode') {
        editor.setReadOnly(true)
        check(phase, 'cancelled', request.signal.aborted, true)
        check(phase, 'loadingRetired', wrapper().classList.contains('oe-image--loading'), false)
        editor.setReadOnly(false)
        const old = request; request = await start()
        old.resolve({ url: initialUrl, alt: 'Stale' }); await pause()
        checkModel('late-retired')
        check(phase, 'successorLoading', wrapper().classList.contains('oe-image--loading'), true)
        request.resolve({ url: nextUrl, alt: '' })
        expected[0].data.file = { url: nextUrl }
      } else if (spec.kind === 'error') request.reject(new Error('Controlled source failure'))
      else {
        if (request) request.resolve({ url: nextUrl, alt: '' })
        expected[0].data.file = { url: spec.source === 'local' ? initialUrl : nextUrl }
      }
      await pause(100); checkModel(phase)
      check(phase, 'visibleSource', picture().getAttribute('src') ?? '', expected[0].data.file.url)
      check(phase, 'loadingSettled', wrapper().classList.contains('oe-image--loading'), false)
      if (spec.source === 'upload') check(phase, 'uploadFile', events.filter(value => value.kind === 'upload'),
        Array.from({ length: spec.kind === 'mode' ? 2 : 1 }, () => ({ kind: 'upload', name: 'tiny.gif', type: 'image/gif', size: 42 })))
      check(phase, 'transactionCount', transactions.length, legacy ? 0 : spec.kind === 'error' ? 0 : 1)
      mark(phase)
      if (spec.kind !== 'error') await replay(original.blocks, expected)
      else check(phase, 'history', [editor.canUndo, editor.canRedo], [false, false])
    } else if (spec.kind === 'caption') {
      phase = 'caption-edit'
      const host = caption(); await click(host)
      const range = document.createRange(); range.selectNodeContents(host); range.collapse(false)
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range)
      await nativeInput('Input.insertText', { text: 'X' }); await pause(100)
      expected[0].data.caption += 'X'; checkModel(phase); render(phase); mark(phase)
      await replay(original.blocks, expected)
      phase = 'sibling-projection'
      const oldCaption = caption(), oldTail = oldCaption.lastChild
      oldCaption.focus(); selection.setBaseAndExtent(oldTail, oldTail.length, oldTail, 0)
      if (legacy) {
        unsupported.push('publicBlockProducer')
        check(phase, 'producerAvailable', typeof editor.blocks?.update === 'function', false)
      } else {
        editor.blocks.update('image', current => ({ data: { ...current.data, withBackground: true } }))
        expected[0].data.withBackground = true; checkModel(phase)
        check(phase, 'sameCaptionHost', caption() === oldCaption, true)
        check(phase, 'sameTextHost', caption().lastChild === oldTail, true)
        check(phase, 'directedRange', [selection.anchorNode === oldTail, selection.anchorOffset, selection.focusNode === oldTail, selection.focusOffset],
          [true, oldTail.length, true, 0])
        render(phase)
      }
      mark(phase)
    } else if (spec.kind === 'appearance') {
      phase = 'appearance'; checkModel(phase); render(phase)
      const rendered = output.querySelector('img')
      const keys = Object.keys(appearance).filter(key => key !== 'backgroundColor')
      const reference = document.createElement('img')
      for (const key of keys) reference.style[key] = appearance[key]
      check(phase, 'editorStyles', Object.fromEntries(keys.map(key => [key, picture().style[key]])), Object.fromEntries(keys.map(key => [key, reference.style[key]])))
      check(phase, 'outputStyles', Object.fromEntries(keys.map(key => [key, rendered.style[key]])), Object.fromEntries(keys.map(key => [key, reference.style[key]])))
      check(phase, 'background', wrapper().querySelector('.oe-image__image-container').style.backgroundColor,
        spec.withBackground ? 'rgb(255, 238, 204)' : '')
      await openSettings(); const height = setting('Height')
      await click(height); await key('a', 'KeyA', 65, 2); await nativeInput('Input.insertText', { text: '90px' })
      await key('Tab', 'Tab', 9); await pause(100)
      expected[0].data.styles.height = '90px'; checkModel(phase); check(phase, 'height', picture().style.height, '90px'); mark(phase)
      await replay(original.blocks, expected)
    } else if (spec.kind === 'expanded') {
      phase = 'expanded'; await openSettings()
      const expanded = setting('Expanded') ?? wrapper().querySelector('.oe-image__switch')
      await click(expanded); expected[0].data.expanded = true; checkModel(phase)
      const owner = wrapper().getBoundingClientRect(), container = wrapper().querySelector('.oe-image__image-container').getBoundingClientRect()
      check(phase, 'fillsOwner', Math.abs(owner.width - container.width) < 1, true)
      check(phase, 'storedWidths', [setting('Width').value, setting('Min width').value, setting('Max width').value], ['180px', '120px', '240px'])
      check(phase, 'disabledWidths', [setting('Width').disabled, setting('Min width').disabled, setting('Max width').disabled], [true, true, true])
      check(phase, 'heightRetained', picture().style.height, '80px'); mark(phase)
      await replay(original.blocks, expected)
      phase = 'restored'; await openSettings(); await click(setting('Expanded') ?? wrapper().querySelector('.oe-image__switch'))
      expected[0].data.expanded = false; checkModel(phase)
      check(phase, 'widthRestored', picture().style.width, '180px'); mark(phase)
    }
    phase = 'dispose'; renderer.destroy(); renderer = null; editor.destroy(); editor = null
    check(phase, 'pendingSourceSignalsRetired', requests.every(request => request.settled || request.signal.aborted), true)
    mark(phase)
  } catch (cause) { error = String(cause?.stack ?? cause) }
  finally { renderer?.destroy(); editor?.destroy(); holder.remove(); output.remove() }
  return { id: spec.id, spec, legacy, observations, phases, events, unsupported, error, failedPhase: error ? phase : null }
}
