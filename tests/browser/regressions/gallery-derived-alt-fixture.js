import { createEditor } from '../../../core/index.js'
import { createGalleryPlugin } from '../../../plugins/gallery/index.js'
import { createMentionPlugin } from '../../../inline-plugins/mention/index.js'
import { createColorSwatchPlugin } from '../../../inline-plugins/color.js'
import { assert, equal, pause } from './harness.js'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwKZz9HwAEvQJYppltbwAAAABJRU5ErkJggg=='
export const galleryWidgetText = 'Alpha @Ada #123456 tail'

function capturedDefinition(definition, occurrences) {
  return { ...definition, setup(runtimeContext) {
    const runtime = definition.setup(runtimeContext)
    return { ...runtime, create(...args) {
      const instance = Reflect.apply(runtime.create, runtime, args)
      occurrences.push({ instance, context: args.at(-1), element: instance.element,
        id: typeof args[0] === 'string' ? args[0] : null })
      return instance
    } }
  } }
}

export async function createGalleryAltFixture({ widgetIndex = 0, readOnly = false, layout = '1' } = {}) {
  const blocks = [], inline = [], transactions = [], holder = document.createElement('section')
  holder.style.width = '700px'
  document.body.append(holder)
  const captions = ['North &amp; &lt;East&gt; &amp;lt;west&amp;gt;', 'Second &amp; &lt;entry&gt;']
  const expectedText = ['North & <East> &lt;west&gt;', 'Second & <entry>']
  if (widgetIndex !== null) {
    captions[widgetIndex] = '<b>Alpha</b> <i>{{mention}}</i> <s>{{swatch}}</s> tail'
    expectedText[widgetIndex] = galleryWidgetText
  }
  const data = { images: [
    { id: 'first', url: pixel, caption: captions[0] },
    { id: 'second', url: pixel, caption: captions[1] },
  ], layout, styles: {}, options: { loop: true, zoom: true, navigation: true, captions: true, fullscreen: true, thumbnails: false } }
  const input = { version: '2.0.0', blocks: [{ id: 'gallery', type: 'gallery', dataVersion: 2, data,
    ...(widgetIndex !== null ? { inline: {
      mention: { type: 'mention', dataVersion: 1, data: { id: 'ada', name: 'Ada' } },
      swatch: { type: 'color', dataVersion: 1, data: { value: '#123456' } },
    } } : {}),
  }] }
  const untouched = structuredClone(input)
  const editor = createEditor({ holder, injectStyles: false, defaultBlock: 'gallery', readOnly,
    plugins: [capturedDefinition(createGalleryPlugin({ injectStyles: false }), blocks)], inlineTools: [],
    inlinePlugins: [capturedDefinition(createMentionPlugin({ searchFunction: async () => [] }), inline),
      capturedDefinition(createColorSwatchPlugin(), inline)], data: input })
  editor.on('transaction:committed', event => transactions.push(event))
  const current = (index = widgetIndex ?? 0) => {
    const record = blocks.findLast(item => item.element.isConnected && !item.context.signal.aborted)
    assert(record, 'The real Gallery instance must be mounted')
    const id = index === 0 ? 'first' : 'second'
    const slot = record.element.querySelector(`.oe-gallery__slot[data-image-id="${id}"]`)
    assert(slot, 'The requested real Gallery slot must exist')
    const caption = slot.querySelector('.oe-gallery__slot-caption'), image = slot.querySelector('.oe-gallery__slot-img')
    assert(caption && image, 'The slot must contain its actual caption and image')
    const field = record.instance.editableFields().find(field => field.key === `image:${id}:caption`)
    assert(field?.element === caption && field.mode === 'rich-text', 'The original keyed field contract must be exact')
    return { ...record, wrapper: record.element, slot, caption, image, field, id }
  }
  let closed = false
  const destroy = () => { if (!closed) { closed = true; editor.destroy() } }
  const dispose = () => { try { destroy() } finally { holder.remove() } }
  try {
    for (const index of [0, 1]) await current(index).image.decode()
    await pause(20)
    equal(input, untouched, 'The caller input must remain intact')
    equal(editor.save().blocks, untouched.blocks, 'Initial canonical fields, IDs, options and sidecars must match the fixture')
    equal([current(0).caption.textContent, current(1).caption.textContent], expectedText,
      'Actual visible literal decoding and Mention/Color hydration are preconditions')
    if (layout === 'masonry') {
      const deadline = Date.now() + 2000
      while ([0, 1].some(index => !current(index).slot.parentNode.classList.contains('masonry-item')) && Date.now() < deadline) await pause(10)
      for (const index of [0, 1]) {
        const parent = current(index).slot.parentNode
        assert(parent.classList.contains('masonry-item') && parent.parentNode.classList.contains('oe-gallery__grid'),
          'The installed Masonry owner must actually wrap the slot before this control executes')
      }
    } else {
      assert(current(0).slot.parentNode.classList.contains('oe-gallery__grid'))
      assert(current(1).slot.parentNode.classList.contains('oe-gallery__overflow'), 'The second caption must exercise a real overflow slot')
    }
    return { editor, current, blocks, inline, transactions, expectedText, input: untouched, destroy, dispose,
      inlineCurrent: id => inline.findLast(item => item.id === id && item.element.isConnected && !item.context.signal.aborted),
    }
  } catch (error) { dispose(); throw error }
}
