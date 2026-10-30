import { test, make, blockElement, equal, assert, pause } from './harness.js'
import { clickNative, dispatchKey, printable } from '../native-input-helpers.js'
import { createGalleryPlugin } from '../../../plugins/gallery/index.js'
import { pixel } from '../plugin-parity-fixtures.js'

test('Gallery native image drag retains keyboard Undo and Redo for a preceding caption edit', async () => {
  const gallery = createGalleryPlugin()
  const original = [{ id: 'gallery', type: 'gallery', dataVersion: 2, data: {
    ...gallery.schema.createDefault(), layout: '3c', styles: { height: '240px' },
    images: ['Alpha', 'Bravo', 'Charlie'].map(caption => ({ id: caption.toLowerCase(), url: pixel, caption })),
  } }]
  const editor = make(original, { plugins: [gallery], defaultBlock: 'gallery', injectStyles: true })
  const wrapper = () => blockElement(editor, 'gallery').querySelector('.oe-gallery')
  const slot = id => wrapper().querySelector(`.oe-gallery__slot[data-image-id="${id}"]`)
  const field = slot('bravo').querySelector('.oe-gallery__slot-caption')
  await clickNative(field)
  await dispatchKey('End', 'End', 35)
  await printable('X')
  const edited = structuredClone(original)
  edited[0].data.images[1].caption = 'BravoX'
  equal(editor.save().blocks, edited, 'Native caption edit was not committed before the drag')

  await clickNative(slot('alpha'))
  const point = element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
  const events = []
  const record = event => events.push({ type: event.type, trusted: event.isTrusted, id: event.target.closest('[data-image-id]')?.dataset.imageId })
  wrapper().addEventListener('dragstart', record, true)
  wrapper().addEventListener('drop', record, true)
  const to = point(slot('charlie'))
  await window.__testInput('Input.drag', { from: point(slot('alpha')), to, via: [to] })
  await pause(30)
  equal(events, [{ type: 'dragstart', trusted: true, id: 'alpha' }, { type: 'drop', trusted: true, id: 'charlie' }])
  const reordered = structuredClone(edited)
  reordered[0].data.images.reverse()
  equal(editor.save().blocks, reordered, 'Native drag did not swap the source and target images')
  assert(wrapper().contains(document.activeElement), 'Native drop left keyboard history outside the Gallery')

  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, edited, 'First native Undo must undo only the image swap')
  await dispatchKey('z', 'KeyZ', 90, 2)
  equal(editor.save().blocks, original, 'Second native Undo must undo only the preceding caption edit')
  equal(editor.canUndo, false)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, edited)
  await dispatchKey('z', 'KeyZ', 90, 2 | 8)
  equal(editor.save().blocks, reordered)
  equal(editor.canRedo, false)
})
