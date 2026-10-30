import { createCarouselPlugin } from '../../../plugins/carousel/index.js'
import { createParagraphPlugin } from '../../../plugins/paragraph/index.js'
import { test, make, para, blockElement, editorHolder, pause, equal, assert } from './harness.js'
import { clickNative, dispatchKey, printable } from '../native-input-helpers.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4ZmVPEmIY1TCqYfhqAACwH08Q21f11gAAAABJRU5ErkJggg=='
const video = new URL('../carousel-roundtrip-16x16.webm', import.meta.url).href
const options = { loop: false, autoplay: false, autoplayDelay: 3000, navigation: true,
  pagination: true, thumbnails: false, aspectRatio: '16 / 9' }

// A completed source batch selects its first new slide in the pinned v1.
// The caption edit and append remain two distinct keyboard history actions.
for (const source of ['source batch', 'URL source', 'HTML source']) {
  test(`Carousel ${source} selects its first added mixed-media slide and retains native history`, async () => {
    const initial = [
      { id: 'alpha', type: 'image', src: pixel, alt: 'Alpha image', caption: 'Alpha' },
      { id: 'bravo', type: 'video', src: video, poster: pixel, alt: 'Bravo video', caption: 'Bravo' },
      { id: 'charlie', type: 'html', html: '<p>Charlie HTML</p>', caption: 'Charlie' },
    ]
    const batch = [
      { id: 'delta', type: 'video', src: video, poster: pixel, alt: 'Delta video', caption: 'Delta' },
      { id: 'echo', type: 'html', html: '<p>Echo HTML</p>', caption: 'Echo' },
    ]
    let calls = 0
    const definition = createCarouselPlugin({ actions: [{ label: 'Append proof slides', handler: async () => {
      calls++; return structuredClone(batch)
    } }] })
    const before = [para('before', 'Before'), { id: 'carousel', type: 'carousel', dataVersion: 1,
      data: { slides: structuredClone(initial), options } }, para('after', 'After')]
    const original = structuredClone(before)
    const editor = make(original, { plugins: [createParagraphPlugin(), definition], injectStyles: true })
    editorHolder(editor).style.width = '640px'
    const root = () => blockElement(editor, 'carousel')
    const field = () => root().querySelector('.oe-carousel-block__caption')
    const button = text => [...root().querySelectorAll('button')].find(element => element.textContent.trim() === text)
    const inputEvents = [], clicks = [], shortcuts = []
    root().addEventListener('input', event => inputEvents.push({ trusted: event.isTrusted, inputType: event.inputType, data: event.data }))
    root().addEventListener('click', event => clicks.push({ trusted: event.isTrusted, text: event.target.closest('button')?.textContent.trim() }))
    root().addEventListener('keydown', event => { if (event.key.toLowerCase() === 'z') shortcuts.push(event.isTrusted) })
    await clickNative(field())
    await dispatchKey('End', 'End', 35)
    await printable('X')
    const edited = structuredClone(before); edited[1].data.slides[0].caption = 'AlphaX'
    equal(editor.save().blocks, edited)
    equal(inputEvents, [{ trusted: true, inputType: 'insertText', data: 'X' }])
    await clickNative(button('Add'))
    let added = batch
    if (source === 'source batch') await clickNative(button('Append proof slides'))
    else {
      await clickNative(button(source === 'URL source' ? 'URL' : 'HTML'))
      const surface = root().querySelector('.oe-source-editor:not([aria-hidden="true"])')
      const value = source === 'URL source' ? video : '<p>Added HTML</p>'
      await clickNative(surface.querySelector('.oe-source-editor__field'))
      await window.__testInput('Input.insertText', { text: value })
      await clickNative(surface.querySelector('button[type="submit"]'))
      const id = editor.save().blocks[1].data.slides[3]?.id
      assert(typeof id === 'string' && id && !initial.some(slide => slide.id === id), 'The source must allocate a new stable slide ID')
      added = [source === 'URL source'
        ? { id, type: 'video', src: video, poster: '', alt: '', caption: '' }
        : { id, type: 'html', html: value, caption: '' }]
      equal(inputEvents.slice(1), [{ trusted: true, inputType: 'insertText', data: value }])
    }
    await pause(50)
    const appended = structuredClone(edited); appended[1].data.slides.push(...structuredClone(added))
    equal(editor.save().blocks, appended, 'A source batch must append all accepted media without changing existing slides')
    equal(calls, source === 'source batch' ? 1 : 0)
    equal(field().dataset.slideId, added[0].id, 'A source left the previous slide active instead of its first appended slide')
    equal(field().textContent, added[0].caption)
    equal(root().querySelector('.oe-carousel-block__counter').textContent, `4 / ${3 + added.length}`)
    assert(root().contains(document.activeElement), 'Appending slides lost keyboard history ownership')
    if (source === 'source batch') equal(clicks.filter(event => event.text === 'Append proof slides'), [{ trusted: true, text: 'Append proof slides' }])
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, edited)
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, before)
    equal([editor.canUndo, editor.canRedo], [false, true])
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, edited)
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, appended)
    equal([editor.canUndo, editor.canRedo], [true, false])
    equal(shortcuts, [true, true, true, true])
    equal(calls, source === 'source batch' ? 1 : 0, 'History replay must not repeat the source action')
    equal(original, before, 'Source actions and history must not change caller input')
  })
}

function structureEditor(definition) {
  const before = [para('before', 'Before'), { id: 'carousel', type: 'carousel', dataVersion: 1, data: {
    slides: [
      { id: 'alpha', type: 'image', src: pixel, alt: 'Alpha image', caption: 'Alpha' },
      { id: 'bravo', type: 'video', src: video, poster: pixel, alt: 'Bravo video', caption: 'Bravo' },
      { id: 'charlie', type: 'html', html: '<p>Charlie HTML</p>', caption: 'Charlie' },
    ], options,
  } }, para('after', 'After')]
  const editor = make(structuredClone(before), { plugins: [createParagraphPlugin(), definition], injectStyles: true })
  editorHolder(editor).style.width = '640px'
  const root = () => blockElement(editor, 'carousel')
  return { editor, before, root,
    field: () => root().querySelector('.oe-carousel-block__caption'),
    button: text => [...root().querySelectorAll('button')].find(element => element.textContent.trim() === text),
  }
}
const controlSlide = { id: 'delta', type: 'html', html: '<p>Delta HTML</p>', caption: 'Delta' }

test('Carousel source selection precedes newer navigation from its committed listener', async () => {
  const h = structureEditor(createCarouselPlugin({ actions: [{ label: 'Append proof slide', handler: async () => [controlSlide] }] }))
  const observed = [], errors = []
  h.editor.on('transaction:committed', event => {
    if (event.action !== 'commit') return
    observed.push(h.field().dataset.slideId)
    queueMicrotask(() => {
      try { h.editor.blocks.focus('carousel', { fieldKey: 'slide:bravo:caption', offset: 'end' }) }
      catch (error) { errors.push(String(error)) }
    })
  })
  await clickNative(h.button('Add'))
  await clickNative(h.button('Append proof slide'))
  await pause(30)
  equal(observed, ['delta'], 'The source selection must be visible before the committed listener runs')
  equal(errors, [])
  equal(h.field().dataset.slideId, 'bravo', 'The completed source overwrote a newer listener navigation')
  equal(document.activeElement, h.field())
  const appended = structuredClone(h.before); appended[1].data.slides.push(structuredClone(controlSlide))
  equal(h.editor.save().blocks, appended)
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(h.editor.save().blocks, h.before)
  await dispatchKey('z', 'KeyZ', 90, 10)
  equal(h.editor.save().blocks, appended)
})

test('Carousel source projection failure remounts original records and preserves canonical history', async () => {
  const base = createCarouselPlugin({ actions: [{ label: 'Append failing slide', handler: async () => [controlSlide] }] })
  let fail = true, failedActiveId = null
  const scopes = []
  // The real Carousel projection runs first. Only the extension boundary's
  // completion is faulted, exercising ordinary canonical rollback/remount.
  const definition = { ...base, setup(runtimeContext) {
    const runtime = base.setup(runtimeContext)
    return { ...runtime, create(initial, context) {
      scopes.push(context.signal)
      const instance = runtime.create(initial, context)
      return { ...instance, update(next, previous) {
        instance.update(next, previous)
        if (fail && next.slides.some(slide => slide.id === 'delta')) {
          fail = false
          failedActiveId = instance.element.querySelector('.oe-carousel-block__caption')?.dataset.slideId
          throw new Error('controlled Carousel projection failure')
        }
      } }
    } }
  } }
  const h = structureEditor(definition)
  const oldRoot = h.root().querySelector('.oe-carousel-block')
  await clickNative(h.field())
  await dispatchKey('End', 'End', 35)
  await printable('X')
  const edited = structuredClone(h.before); edited[1].data.slides[0].caption = 'AlphaX'
  await clickNative(h.button('Add'))
  await clickNative(h.button('Append failing slide'))
  await pause(30)
  equal(failedActiveId, 'delta', 'The controlled fault must happen after projecting the added slide')
  equal(h.editor.save().blocks, edited, 'A rejected source leaked its slides into canonical data')
  equal(h.field().dataset.slideId, 'alpha', 'Recovery clamped the failed added index onto an old neighbor')
  equal(h.field().textContent, 'AlphaX')
  assert(!oldRoot.isConnected && scopes[0].aborted, 'Canonical recovery must retire the failed Carousel owner')
  equal([h.editor.canUndo, h.editor.canRedo], [true, false])
  // This control covers canonical recovery. The separate native-keyboard
  // failure diagnostic is retained in the source-selection evidence.
  equal(h.editor.undo(), true)
  equal(h.editor.save().blocks, h.before, 'The failed source must preserve the prior canonical history entry')
  equal(h.editor.redo(), true)
  equal(h.editor.save().blocks, edited)
})

test('Carousel source task revoked by Remove all cannot select or append after Undo and newer navigation', async () => {
  let finish, signal
  const h = structureEditor(createCarouselPlugin({ actions: [{ label: 'Append delayed slide', handler: context => {
    signal = context.signal
    return new Promise(resolve => { finish = resolve })
  } }] }))
  await clickNative(h.button('Add'))
  await clickNative(h.button('Append delayed slide'))
  assert(typeof finish === 'function' && signal && !signal.aborted, 'The source task did not start')
  await clickNative(h.root().querySelector('[aria-label="Remove all slides"]'))
  assert(signal.aborted, 'Remove all must revoke its pending source task')
  equal(h.editor.save().blocks[1].data.slides, [])
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(h.editor.save().blocks, h.before)
  await clickNative(h.root().querySelector('[aria-label="Next slide"]'))
  equal(h.field().dataset.slideId, 'bravo')
  finish([controlSlide])
  await pause(50)
  equal(h.editor.save().blocks, h.before, 'A retired source task committed after Undo')
  equal(h.field().dataset.slideId, 'bravo', 'A retired source task applied an obsolete active-slide choice')
  equal([h.editor.canUndo, h.editor.canRedo], [false, true])
})

test('Carousel source activation replaces the previous manual settings target with the added slide', async () => {
  const h = structureEditor(createCarouselPlugin({ actions: [{ label: 'Append proof slide', handler: async () => [controlSlide] }] }))
  const picker = () => h.root().querySelector('.oe-carousel-block__dropdown-panel .oe-carousel-block__slide-select')
  await clickNative(h.button('Settings'))
  await clickNative(picker())
  await dispatchKey('ArrowDown', 'ArrowDown', 40)
  await dispatchKey('Enter', 'Enter', 13)
  equal(picker().value, 'bravo', 'The native picker must select an existing inactive slide before adding')
  equal(h.field().dataset.slideId, 'alpha', 'A manual settings target must not navigate the media stage')
  await clickNative(h.button('Add'))
  await clickNative(h.button('Append proof slide'))
  equal(h.field().dataset.slideId, 'delta')
  await clickNative(h.button('Settings'))
  equal(picker().value, 'delta', 'Added-slide navigation left settings editing a different old slide')
  equal(h.root().querySelector('.oe-carousel-block__dropdown-panel textarea')?.value, '<p>Delta HTML</p>')
})
