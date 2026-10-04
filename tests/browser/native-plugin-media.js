import { test, make, editorRoot, blockElement, pause, assert, equal, run } from './regressions/harness.js'
import { clickNative, dispatchKey, waitForStyles } from './native-input-helpers.js'
import { createParagraphPlugin, createEmbedPlugin, createImagePlugin, createGalleryPlugin, createCarouselPlugin, createAttachesPlugin, createTogglePlugin, createSpoilerPlugin } from '../../plugins/index.js'
import { pixel } from './plugin-parity-fixtures.js'
import en from '../../locale/en.js'

function mount(definition, data = {}) {
  return make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion, data: { ...definition.schema.createDefault(), ...data } }], { injectStyles: true, plugins: [createParagraphPlugin(), definition] })
}
async function history(editor, before, after) {
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, before, 'Native Undo failed after the media action')
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, after, 'Native Redo failed after the media action')
}
async function enterText(input, text) {
  await clickNative(input)
  await dispatchKey('a', 'KeyA', 65, 2)
  await window.__testInput('Input.insertText', { text })
}
function button(editor, label) {
  return [...blockElement(editor, 'a').querySelectorAll('button')].find(element => element.textContent.trim() === label)
}
const filled = { service: 'youtube', videoId: 'dQw4w9WgXcQ', caption: 'Alpha', cover: pixel, title: 'Title', duration: '1:23' }
for (const mode of ['Enter', 'debounce']) {
  test(`Embed native URL ${mode} inserts its player and one keyboard history step`, async () => {
    const editor = mount(createEmbedPlugin({ resolvePreview: false }))
    await pause(120)
    const before = editor.save().blocks
    await enterText(blockElement(editor, 'a').querySelector('.oe-embed__url-input'), 'https://youtu.be/dQw4w9WgXcQ')
    if (mode === 'Enter') await dispatchKey('Enter', 'Enter', 13)
    else await pause(650)
    const after = editor.save().blocks
    equal(after[0].data, { ...before[0].data, service: 'youtube', videoId: 'dQw4w9WgXcQ' })
    assert(blockElement(editor, 'a').querySelector('.oe-embed__play-btn'), 'URL did not mount a playable preview')
    await history(editor, before, after)
  })
}
test('Embed Replace exposes a usable URL field and changes providers atomically', async () => {
  const editor = mount(createEmbedPlugin({ resolvePreview: false }), filled)
  await pause(120)
  const before = editor.save().blocks
  await clickNative(button(editor, 'Replace'))
  const input = blockElement(editor, 'a').querySelector('.oe-embed__url-input')
  assert(input.getClientRects().length && !input.closest('[hidden]'), 'Replace focused a hidden URL input')
  await enterText(input, 'https://vimeo.com/123456789')
  await dispatchKey('Enter', 'Enter', 13)
  const after = editor.save().blocks
  equal(after[0].data, { ...before[0].data, service: 'vimeo', videoId: '123456789' })
  await history(editor, before, after)
})
for (const [key, text, selector] of [['title', 'Changed title', '.oe-embed__title'], ['duration', '2:34', '.oe-embed__duration']]) {
  test(`Embed Settings edits ${key} and its visible overlay with one history step`, async () => {
    const editor = mount(createEmbedPlugin({ resolvePreview: false }), filled)
    await pause(120)
    const before = editor.save().blocks
    await clickNative(button(editor, 'Settings'))
    const input = blockElement(editor, 'a').querySelector(`.oe-embed__dropdown-panel input[data-setting="${key}"]`)
    assert(input, 'Embed lost the ' + key + ' setting')
    await enterText(input, text)
    await dispatchKey('Tab', 'Tab', 9)
    const after = editor.save().blocks
    equal(after[0].data, { ...before[0].data, [key]: text })
    equal(blockElement(editor, 'a').querySelector(selector)?.textContent, text)
    await dispatchKey('Escape', 'Escape', 27)
    await history(editor, before, after)
  })
}
test('Embed Cover drill-down supplies URL, Remove and Back without losing the video', async () => {
  const editor = mount(createEmbedPlugin({ resolvePreview: false }), filled)
  await pause(120)
  const before = editor.save().blocks
  await clickNative(button(editor, 'Cover'))
  const subview = blockElement(editor, 'a').querySelector('.oe-embed__actions-view--cover')
  assert(subview && !subview.hidden, 'Cover drill-down is missing')
  await clickNative(button(editor, 'Remove'))
  const after = editor.save().blocks
  equal(after[0].data, { ...before[0].data, cover: '' })
  await history(editor, before, after)
  await clickNative(button(editor, 'Cover'))
  await clickNative(button(editor, 'URL'))
  const surface = blockElement(editor, 'a').querySelector('.oe-source-editor:not([aria-hidden="true"])')
  assert(surface, 'Cover URL form is missing')
  await enterText(surface.querySelector('input'), '/replacement.png')
  await clickNative(surface.querySelector('button[type="submit"]'))
  equal(editor.save().blocks[0].data, { ...before[0].data, cover: '/replacement.png' })
})
for (const [name, factory, result, key] of [
  ['Image', createImagePlugin, { url: pixel, alt: 'Library image' }, 'file'],
  ['Gallery', createGalleryPlugin, [{ url: pixel, alt: 'Library image' }], 'images'],
  ['Carousel', createCarouselPlugin, [{ type: 'image', src: pixel, alt: 'Library slide' }], 'slides'],
  ['Attaches', createAttachesPlugin, [{ url: '/library.txt', name: 'Library file' }], 'files'],
  ['Embed', createEmbedPlugin, { url: pixel }, 'cover'],
]) {
  test(`${name} custom media source mounts its result and preserves native history`, async () => {
    let calls = 0
    const definition = factory({ resolvePreview: false, actions: [{ label: 'Media library', handler: async ({ signal }) => { calls++; assert(!signal.aborted); return result } }] })
    const editor = mount(definition, name === 'Embed' ? { ...filled, cover: '' } : {})
    await pause(120)
    const before = editor.save().blocks
    if (name === 'Embed') await clickNative(button(editor, 'Cover'))
    await clickNative(button(editor, 'Media library'))
    await pause(60)
    const after = editor.save().blocks
    equal(calls, 1)
    if (name === 'Image') equal(after[0].data.file.url, pixel)
    else if (name === 'Embed') equal(after[0].data.cover, pixel)
    else equal(after[0].data[key].length, 1)
    await history(editor, before, after)
  })
}
for (const [name, factory, label, url, key] of [
  ['Image', createImagePlugin, 'URL', '/new.png', 'file'],
  ['Gallery', createGalleryPlugin, 'URL', '/new.png', 'images'],
  ['Carousel', createCarouselPlugin, 'URL', '/new.png', 'slides'],
  ['Attaches', createAttachesPlugin, 'URL', '/new.txt', 'files'],
]) {
  test(`${name} URL dialog accepts native input and retains keyboard Undo/Redo`, async () => {
    const editor = mount(factory())
    await pause(120)
    const before = editor.save().blocks
    const urlButton = [...blockElement(editor, 'a').querySelectorAll('button')].find(element => element.textContent.trim().includes(label))
    await clickNative(urlButton)
    const surface = blockElement(editor, 'a').querySelector('.oe-source-editor:not([aria-hidden="true"])')
    assert(surface, 'URL dialog is missing')
    await enterText(surface.querySelector('input'), url)
    await clickNative(surface.querySelector('button[type="submit"]'))
    const after = editor.save().blocks
    const source = name === 'Image' ? after[0].data[key] : after[0].data[key][0]
    equal(source.url ?? source.src, url)
    await history(editor, before, after)
  })
}
for (const readOnly of [false, true]) {
  test(`Embed Play exposes the iframe and hides preview overlays in ${readOnly ? 'read-only' : 'editor'} mode`, async () => {
    const editor = mount(createEmbedPlugin({ resolvePreview: false }), filled)
    editor.setReadOnly(readOnly)
    await pause(120)
    const before = editor.save().blocks
    await clickNative(blockElement(editor, 'a').querySelector('.oe-embed__play-btn'))
    const iframe = blockElement(editor, 'a').querySelector('iframe')
    assert(iframe?.src.startsWith('https://www.youtube.com/embed/dQw4w9WgXcQ?'), 'Play did not create the provider iframe')
    const preview = blockElement(editor, 'a').querySelector('.oe-embed__preview')
    equal(getComputedStyle(preview).pointerEvents, 'none', 'Preview continues to intercept input above the playing video')
    equal(getComputedStyle(blockElement(editor, 'a').querySelector('.oe-embed__title')).display, 'none', 'Title covers the playing video')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}
const carouselData = { slides: [{ id: 'first', type: 'image', src: pixel, caption: 'Alpha', alt: '' }, { id: 'second', type: 'image', src: pixel, caption: 'Bravo', alt: '' }], options: { loop: false, autoplay: false, navigation: true, pagination: true, thumbnails: false } }
for (const readOnly of [false, true]) {
  test(`Carousel autoplay advances and loops without author history in ${readOnly ? 'read-only' : 'editor'} mode`, async () => {
    const editor = mount(createCarouselPlugin(), { ...carouselData, options: { ...carouselData.options, loop: true, autoplay: true, autoplayDelay: 250 } })
    editor.setReadOnly(readOnly)
    const before = editor.save().blocks
    const waitForCounter = async value => {
      const deadline = Date.now() + 5000
      while (blockElement(editor, 'a').querySelector('.oe-carousel-block__counter')?.textContent !== value) {
        assert(Date.now() < deadline, 'Autoplay did not reach slide ' + value)
        await pause(20)
      }
    }
    await waitForCounter('2 / 2')
    await waitForCounter('1 / 2')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}
test('Carousel disabled navigation and pagination remove their actual controls', async () => {
  const editor = mount(createCarouselPlugin(), { ...carouselData, options: { ...carouselData.options, navigation: false, pagination: false } })
  await pause(120)
  equal(blockElement(editor, 'a').querySelectorAll('.oe-carousel-block__nav, .oe-carousel-block__dots').length, 0)
})
test('Carousel keeps its current slide counter while navigating', async () => {
  const editor = mount(createCarouselPlugin(), carouselData)
  await pause(120)
  const before = editor.save().blocks
  equal(blockElement(editor, 'a').querySelector('.oe-carousel-block__counter')?.textContent, '1 / 2')
  await clickNative(blockElement(editor, 'a').querySelector('.oe-carousel-block__nav--next'))
  equal(blockElement(editor, 'a').querySelector('.oe-carousel-block__counter')?.textContent, '2 / 2')
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})
test('Carousel inline Settings changes thumbnails visibly and preserves native history', async () => {
  const editor = mount(createCarouselPlugin(), carouselData)
  await pause(120)
  const before = editor.save().blocks
  await clickNative(button(editor, 'Settings'))
  const panel = blockElement(editor, 'a').querySelector('.oe-carousel-block__dropdown-panel')
  const label = [...panel.querySelectorAll('label')].find(element => element.textContent.trim() === 'Thumbnails')
  await clickNative(label.querySelector('input'))
  const after = editor.save().blocks
  equal(after[0].data.options, { ...before[0].data.options, thumbnails: true })
  equal(blockElement(editor, 'a').querySelectorAll('.oe-carousel-block__thumbnail img').length, 2)
  await history(editor, before, after)
})
test('Carousel Remove all slides retains the block and one keyboard Undo/Redo', async () => {
  const editor = mount(createCarouselPlugin(), carouselData)
  await pause(120)
  const before = editor.save().blocks
  await clickNative(blockElement(editor, 'a').querySelector('[aria-label="Remove all slides"]'))
  const after = editor.save().blocks
  equal(after, [{ ...before[0], data: { ...before[0].data, slides: [] } }])
  await history(editor, before, after)
})
for (const [kind, value, selector] of [['HTML', '<h3>Authored HTML slide</h3>', '.oe-carousel-block__html h3'], ['URL', '/sample.webm', 'video']]) {
  test(`Carousel ${kind} source mounts its authored media and one native history step`, async () => {
    const editor = mount(createCarouselPlugin())
    await pause(120)
    const before = editor.save().blocks
    const sourceButton = [...blockElement(editor, 'a').querySelectorAll('button')].find(element => element.textContent.trim().includes(kind))
    await clickNative(sourceButton)
    const surface = blockElement(editor, 'a').querySelector('.oe-source-editor:not([aria-hidden="true"])')
    await enterText(surface.querySelector('input,textarea'), value)
    await clickNative(surface.querySelector('button[type="submit"]'))
    const after = editor.save().blocks
    assert(blockElement(editor, 'a').querySelector(selector), 'Authored media is absent from the visible stage')
    if (kind === 'HTML') equal(after[0].data.slides[0].html, value)
    else { equal(after[0].data.slides[0].type, 'video'); equal(after[0].data.slides[0].src, value) }
    await history(editor, before, after)
  })
}
for (const layout of ['auto','1','2','3a','3b','3c','4a','4b','4c','5a','5b','5c','6a','6b','6c','triptych','masonry','poly-5','poly-3arch','poly-5flat','poly-3steps']) {
  test(`Gallery native layout ${layout} applies its actual geometry without changing assets`, async () => {
    const editor = mount(createGalleryPlugin(), { images: [{ id: 'first', url: pixel, caption: 'Alpha' }, { id: 'second', url: pixel, caption: 'Bravo' }], layout: 'auto' })
    await pause(120)
    const before = editor.save().blocks
    editor.blocks.focus('a', { fieldKey: 'image:first:caption', offset: 2 })
    await clickNative(blockElement(editor, 'a').querySelector('.oe-gallery__dropdown > button'))
    await clickNative(blockElement(editor, 'a').querySelector(`[data-layout="${layout}"]`))
    const after = editor.save().blocks
    equal(after[0].data, { ...before[0].data, layout })
    const grid = blockElement(editor, 'a').querySelector('.oe-gallery__grid')
    assert(grid.classList.contains('eg--' + (layout === 'auto' ? '2' : layout)), 'Layout is only stored in JSON')
    const rect = grid.getBoundingClientRect()
    assert(rect.width > 0 && rect.height > 0, 'Gallery layout has no visible area')
    assert(rect.width <= blockElement(editor, 'a').getBoundingClientRect().width + 1, 'Layout overflowed its block')
    if (layout === 'auto') { equal(after, before); equal(editor.canUndo, false) }
    else await history(editor, before, after)
  })
}
for (const [factory, data, selector, content] of [
  [createTogglePlugin, { title: 'Alpha', content: 'Bravo', open: false }, '.oe-toggle__chevron', '.oe-toggle__body'],
  [createSpoilerPlugin, { label: 'Alpha', content: 'Bravo' }, '.oe-spoiler__toggle', '.oe-spoiler__content'],
]) {
  test(`${factory().type} can reveal and hide content in read-only mode without author history`, async () => {
    const editor = mount(factory(), data)
    editor.setReadOnly(true)
    await pause(120)
    const before = editor.save().blocks
    const target = blockElement(editor, 'a').querySelector(content)
    const beforeVisible = !!target.getClientRects().length && getComputedStyle(target).visibility !== 'hidden'
    await clickNative(blockElement(editor, 'a').querySelector(selector))
    const shown = blockElement(editor, 'a').querySelector(content)
    const afterVisible = !!shown.getClientRects().length && getComputedStyle(shown).visibility !== 'hidden'
    assert(afterVisible !== beforeVisible, 'Read-only reveal control does not change presentation')
    await clickNative(blockElement(editor, 'a').querySelector(selector))
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
  })
}
test('Gallery overflow controls stay separate from its editable caption and reorder with one history step', async () => {
  const editor = mount(createGalleryPlugin(), { images: [
    { id: 'first', url: pixel, caption: 'Alpha' },
    { id: 'second', url: pixel, caption: 'Bravo' },
    { id: 'third', url: pixel, caption: 'Delta' },
  ], layout: '1' })
  await waitForStyles(document)
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const before = editor.save().blocks
  const slot = blockElement(editor, 'a').querySelector('.oe-gallery__overflow-item')
  const frame = slot.getBoundingClientRect()
  const caption = slot.querySelector('.oe-gallery__slot-caption').getBoundingClientRect()
  const controls = [...slot.querySelectorAll('button')].filter(element => !element.disabled)
  const boxes = controls.map(element => element.getBoundingClientRect())
  for (const box of boxes) {
    assert(box.left >= frame.left && box.right <= frame.right, 'Gallery control escapes its thumbnail')
    assert(box.bottom <= caption.top, 'Gallery control intercepts its editable caption')
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    assert(boxes[i].right <= boxes[j].left || boxes[j].right <= boxes[i].left, 'Gallery controls overlap one another')
  }
  await clickNative(slot.querySelector('.oe-gallery__slot-move--forward'))
  const after = editor.save().blocks
  equal(after[0].data.images, [before[0].data.images[0], before[0].data.images[2], before[0].data.images[1]])
  await history(editor, before, after)
})

for (const [name, factory, data, key] of [
  ['Gallery', createGalleryPlugin, { images: [{ id: 'first', url: pixel, caption: 'Alpha' }], layout: '1' }, 'images'],
  ['Carousel', createCarouselPlugin, { slides: [{ id: 'first', type: 'image', src: pixel, caption: 'Alpha' }] }, 'slides'],
]) {
  test(`${name} filled Add drills into sources, returns with Back and commits a selected source once`, async () => {
    const result = name === 'Gallery' ? [{ url: pixel, alt: 'Library asset' }] : [{ type: 'image', src: pixel, alt: 'Library asset' }]
    const editor = mount(factory({ actions: [{ label: 'Library', handler: async () => result }] }), data)
    const before = editor.save().blocks
    const actions = () => blockElement(editor, 'a').querySelector(name === 'Gallery' ? '.oe-gallery__actions' : '.oe-carousel-block__actions')
    const visible = () => [...actions().querySelectorAll('button')]
      .filter(element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
    const add = () => visible().find(element => /^(Add|Add images)$/.test(element.textContent.trim()))
    await clickNative(add())
    equal(visible().map(element => element.textContent.trim()), ['Back', 'Upload', 'Library', 'URL', ...(name === 'Carousel' ? ['HTML'] : [])])
    await clickNative(button(editor, 'Back'))
    assert(add(), 'Back did not restore the main Add control')
    assert(!visible().some(element => element.textContent.trim() === 'Library'), 'Back left the source view visible')
    equal(editor.save().blocks, before)
    equal(editor.canUndo, false)
    await clickNative(add())
    await clickNative(button(editor, 'Library'))
    const after = editor.save().blocks
    equal(after[0].data[key].length, 2)
    equal(after[0].data[key][1][name === 'Gallery' ? 'caption' : 'alt'], 'Library asset')
    assert(add(), 'Source insertion did not return to the main view')
    await history(editor, before, after)
  })
}

test('Image filled Replace switches to source actions and Back restores the main menu without history', async () => {
  const editor = mount(createImagePlugin({ actions: [{ label: 'Library', handler: async () => ({ url: pixel }) }] }), { file: { url: pixel }, caption: 'Alpha' })
  const before = editor.save().blocks
  await clickNative(button(editor, 'Replace'))
  const visible = () => [...blockElement(editor, 'a').querySelectorAll('.oe-image__actions button')]
    .filter(element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
  equal(visible().map(element => element.textContent.trim()), ['Back','Upload','Library','URL'])
  await clickNative(button(editor, 'Back'))
  equal(visible().map(element => element.textContent.trim() || element.getAttribute('aria-label')), ['Settings','Replace','Delete'])
  equal(editor.save().blocks, before)
  equal(editor.canUndo, false)
})

test('Image inline Settings edits actual dimensions and preserves one native Undo/Redo', async () => {
  const editor = mount(createImagePlugin(), { file: { url: pixel }, caption: 'Alpha' })
  const before = editor.save().blocks
  await clickNative(button(editor, 'Settings'))
  const panel = blockElement(editor, 'a').querySelector('.oe-image__dropdown-panel')
  assert(panel.checkVisibility(), 'Inline Image settings did not open')
  const width = [...panel.querySelectorAll('label')].find(label => label.querySelector('span')?.textContent === 'Width').querySelector('input')
  await enterText(width, '160px')
  await dispatchKey('Tab', 'Tab', 9)
  const after = editor.save().blocks
  equal(after[0].data, { ...before[0].data, styles: { ...before[0].data.styles, width: '160px' } })
  equal(blockElement(editor, 'a').querySelector('img').style.width, '160px')
  assert(editorRoot(editor).contains(document.activeElement), 'Settings commit lost keyboard ownership')
  await history(editor, before, after)
  equal(blockElement(editor, 'a').querySelector('img').style.width, '160px')
})

for (const [name, factory, data, selector] of [
  ['Image', createImagePlugin, { file: { url: pixel }, styles: { height: '260px' } }, '.oe-image__dropdown-panel'],
  ['Gallery', createGalleryPlugin, { images: [{ id: 'first', url: pixel, caption: 'Alpha' }], layout: '1' }, '.oe-gallery__dropdown-panel'],
  ['Carousel', createCarouselPlugin, carouselData, '.oe-carousel-block__dropdown-panel'],
  ['Embed', () => createEmbedPlugin({ resolvePreview: false }), filled, '.oe-embed__dropdown-panel'],
]) {
  test(`${name} Settings fits a short narrow viewport and keeps every input inside its panel`, async () => {
    await window.__testInput('Viewport.set', { width: 320, height: 500 })
    try {
      const definition = factory()
      const editor = make([{ id: 'a', type: definition.type, dataVersion: definition.schema.currentVersion,
        data: { ...definition.schema.createDefault(), ...data } }], { injectStyles: true, locale: en, plugins: [createParagraphPlugin(), definition] })
      const before = editor.save().blocks
      await clickNative(button(editor, 'Settings'))
      const panel = blockElement(editor, 'a').querySelector(selector)
      const rect = panel.getBoundingClientRect()
      assert(rect.top >= 8 && rect.bottom <= 492 && rect.left >= 8 && rect.right <= 312, `Settings escapes the viewport: ${JSON.stringify({ panel: rect.toJSON(), anchor: panel.parentElement.getBoundingClientRect().toJSON(), css: panel.style.cssText })}`)
      assert(panel.scrollWidth <= Math.ceil(rect.width), 'Settings requires horizontal scrolling')
      for (const input of panel.querySelectorAll('input,textarea,select')) {
        const box = input.getBoundingClientRect()
        assert(box.left >= rect.left && box.right <= rect.right, 'Settings input escapes its panel')
        if (input.type === 'checkbox') equal(getComputedStyle(input).appearance, 'none', 'Settings switch lost its v1 skin')
      }
      equal(editor.save().blocks, before)
      equal(editor.canUndo, false)
    } finally { await window.__testInput('Viewport.reset') }
  })
}

test('Image Settings stays inside a short viewport and its styled switches keep native history', async () => {
  await window.__testInput('Viewport.set', { width: 680, height: 500 })
  try {
    const editor = mount(createImagePlugin(), { file: { url: pixel }, caption: 'Alpha', styles: { width: '480px', height: '260px' } })
    const before = editor.save().blocks
    await clickNative(button(editor, 'Settings'))
    const panel = blockElement(editor, 'a').querySelector('.oe-image__dropdown-panel')
    const rect = panel.getBoundingClientRect()
    assert(rect.top >= 8 && rect.bottom <= 492, `Settings escapes the viewport: ${JSON.stringify(rect.toJSON())}`)
    const checkbox = panel.querySelector('input[type="checkbox"]')
    equal(getComputedStyle(checkbox).borderRadius, '8px', 'Image switch lost its v1 skin')
    equal(getComputedStyle(checkbox).appearance, 'none')
    await clickNative(checkbox)
    const after = editor.save().blocks
    equal(after[0].data, { ...before[0].data, expanded: true })
    await history(editor, before, after)
  } finally { await window.__testInput('Viewport.reset') }
})

await run()
