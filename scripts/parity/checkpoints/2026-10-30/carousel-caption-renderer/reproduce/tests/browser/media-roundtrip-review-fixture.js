// Isolated acceptance-gap probe. Fixed plain captions avoid treating v1's
// plain-text wire representation as current rich-text source markup.
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
const galleryOptions = { loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false }
const carouselOptions = { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true, pagination: true, thumbnails: false }
export const mediaRoundtripCases = ['gallery', 'carousel'].flatMap(type => [false, true].map(populated => ({
  type, populated, id: `MEDIA_ROUNDTRIP_REVIEW/${type}/${populated ? 'populated-native-ampersand' : 'actual-default'}`,
})))
const clone = value => structuredClone(value)
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function settle() {
  const deadline = Date.now() + 10_000
  while ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled && !link.sheet)) {
    if (Date.now() > deadline) throw new Error('Media review stylesheet timeout')
    await pause(20)
  }
  await document.fonts?.ready
  await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity)
    .map(animation => animation.finished.catch(() => {})))
  await pause(30)
}

export async function runMediaRoundtripCase(spec, { sourceBase, legacy = false, typeText, shortcut }) {
  const base = new URL(sourceBase, location.href)
  const [{ createEditor }, plugin, { EditorRenderer }] = await Promise.all([
    import(new URL('core/index.js', base).href), import(new URL(`plugins/${spec.type}/index.js`, base).href),
    import(new URL('renderer/index.js', base).href),
  ])
  const gallery = spec.type === 'gallery', name = gallery ? 'Gallery' : 'Carousel'
  const data = gallery ? { images: spec.populated ? ['Alpha', 'Bravo'].map((caption, index) => ({
    ...(!legacy ? { id: index ? 'second' : 'first' } : {}), url: pixel, caption,
  })) : [], layout: spec.populated ? '2' : 'auto', styles: {}, options: clone(galleryOptions) }
    : { slides: spec.populated ? ['Alpha', 'Bravo'].map((caption, index) => ({
      id: index ? 'second' : 'first', type: 'image', src: pixel, alt: index ? 'Second image' : 'First image', caption,
    })) : [], options: { ...carouselOptions, ...(spec.populated ? { aspectRatio: '16 / 9' } : {}) } }
  const input = { version: legacy ? '1.0.5' : '2.0.0', blocks: [{ id: 'probe', type: spec.type,
    ...(!legacy ? { dataVersion: gallery ? 2 : 1 } : {}), data: clone(data) }] }
  const beforeInput = JSON.stringify(input), observations = [], phases = [], trusted = []
  const check = (phase, property, actual, expected) => observations.push({ phase, property, actual, expected,
    status: JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)) ? 'PASS' : 'FAIL' })
  const holder = document.createElement('section'), mounted = document.createElement('section'), attached = document.createElement('section')
  holder.style.width = mounted.style.width = attached.style.width = '640px'
  document.body.append(holder, mounted, attached)
  let editor, renderer, phase = 'create', destroyed = false
  try {
    const definition = legacy ? new plugin[name]() : plugin[`create${name}Plugin`]()
    editor = createEditor({ holder, plugins: [definition], defaultBlock: spec.type, inlineTools: [], injectStyles: true,
      ...(spec.populated ? { data: input } : {}) })
    renderer = new EditorRenderer({ blockTypes: [spec.type], injectStyles: true })
    await settle()
    const blockId = spec.populated ? 'probe' : editor.save().blocks[0]?.id
    check('create', 'actualDefaultHasGeneratedIdentity', typeof blockId === 'string' && blockId.length > 0, true)
    const field = () => holder.querySelector(gallery ? '.oe-gallery__slot-caption' : '.oe-carousel-block__caption')
    holder.addEventListener('input', event => trusted.push({ type: 'input', trusted: event.isTrusted, inputType: event.inputType, data: event.data }))
    holder.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'z') trusted.push({ type: 'history', trusted: event.isTrusted }) })
    const expectedRecords = edited => {
      const expected = clone(data)
      if (spec.populated) expected[gallery ? 'images' : 'slides'][0].caption = edited ? legacy ? 'Alpha&' : 'Alpha&amp;' : 'Alpha'
      return [{ id: blockId, type: spec.type, ...(!legacy ? { dataVersion: gallery ? 2 : 1 } : {}), data: expected }]
    }
    const inspect = async (current, edited, readOnly, history) => {
      phase = current
      const saved = editor.save(), visible = edited ? 'Alpha&' : 'Alpha'
      check(phase, 'exactCanonicalRecords', saved.blocks, expectedRecords(edited))
      check(phase, 'history', { canUndo: editor.canUndo, canRedo: editor.canRedo }, history)
      check(phase, 'inputUnchanged', JSON.stringify(input), beforeInput)
      check(phase, 'editorCaption', field()?.textContent ?? null, spec.populated ? visible : null)
      if (spec.populated) check(phase, 'editorCaptionEditable', field().contentEditable, String(!readOnly))
      else check(phase, 'noInventedEditableCaption', holder.querySelectorAll(gallery ? '.oe-gallery__slot-caption' : '.oe-carousel-block__caption').length, 0)
      const inspectOutput = (root, surface) => {
        const actual = gallery ? [...root.querySelectorAll('.editor-gallery__item img')].map(image => image.alt)
          : [...root.querySelectorAll('.editor-carousel-block__slide figcaption')].map(caption => caption.textContent)
        check(phase, `${surface}VisibleCaptions`, actual, spec.populated ? [visible, 'Bravo'] : [])
      }
      const detached = renderer.render(saved)
      check(phase, 'detachedOutput', detached.isConnected, false)
      inspectOutput(detached, 'detached')
      attached.append(detached); await settle(); inspectOutput(detached, 'attachedDetached')
      renderer.renderTo(saved, mounted); await settle(); inspectOutput(mounted, 'renderTo')
      renderer.destroy(detached); detached.remove(); attached.replaceChildren()
      phases.push({ phase, blocks: saved.blocks, visibleCaption: field()?.textContent ?? null })
    }
    await inspect('load', false, false, { canUndo: false, canRedo: false })
    editor.setReadOnly(true); await settle()
    await inspect('read-only', false, true, { canUndo: false, canRedo: false })
    editor.setReadOnly(false); await settle()
    await inspect('editable-again', false, false, { canUndo: false, canRedo: false })
    if (spec.populated) {
      const target = field(), tail = target.lastChild
      target.focus(); getSelection().setBaseAndExtent(tail, tail.length, tail, tail.length)
      await typeText('&'); await settle()
      await inspect('edit', true, false, { canUndo: true, canRedo: false })
      check('edit', 'actualNativeInput', trusted.filter(event => event.type === 'input'), [{ type: 'input', trusted: true, inputType: 'insertText', data: '&' }])
      await shortcut('undo'); await settle()
      await inspect('undo', false, false, { canUndo: false, canRedo: true })
      // V1 can restore focus to the block boundary. Focus only the current
      // declared author host to deliver the requested native Redo shortcut.
      field().focus()
      await shortcut('redo'); await settle()
      await inspect('redo', true, false, { canUndo: true, canRedo: false })
      check('redo', 'actualNativeHistory', trusted.filter(event => event.type === 'history'), [{ type: 'history', trusted: true }, { type: 'history', trusted: true }])
    }
    phase = 'dispose'
    renderer.destroy(mounted); renderer.destroy(); editor.destroy(); editor.destroy(); destroyed = true
    await settle()
    check(phase, 'editorDisposed', holder.querySelector('.oe-editor'), null)
    check(phase, 'mountedOutputDisposed', mounted.childNodes.length, 0)
    return { id: spec.id, phases, trusted, observations, failures: observations.filter(item => item.status === 'FAIL'),
      notApplicablePhases: spec.populated ? [] : ['edit', 'undo', 'redo'] }
  } catch (error) {
    return { id: spec.id, phase, phases, trusted, observations, error: String(error.stack ?? error),
      failures: [...observations.filter(item => item.status === 'FAIL'), { phase, property: 'execution', actual: String(error), status: 'ERROR' }] }
  } finally {
    try { renderer?.destroy() } finally {
      try { if (!destroyed) editor?.destroy() } finally { holder.remove(); mounted.remove(); attached.remove() }
    }
  }
}
