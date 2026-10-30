import { createEditor } from '../../../core/index.js'
import { createCarouselPlugin } from '../../../plugins/carousel/index.js'
import { test, equal, assert } from './harness.js'
import { printable, dispatchKey, waitForStyles } from '../native-input-helpers.js'
import { carouselCaptionDocument, assertCarouselCaptions } from './carousel-caption-fixture.js'

test('Carousel native caption ampersand survives modes and one keyboard Undo/Redo in rendered output', async () => {
  const input = carouselCaptionDocument(['Alpha', 'Bravo']), holder = document.createElement('section')
  holder.style.width = '640px'; document.body.append(holder)
  const editor = createEditor({ holder, plugins: [createCarouselPlugin()], defaultBlock: 'carousel', data: input, injectStyles: true })
  const field = () => holder.querySelector('.oe-carousel-block__caption'), transactions = [], inputs = [], history = []
  editor.on('transaction:committed', event => transactions.push(event.action))
  holder.addEventListener('input', event => inputs.push({ trusted: event.isTrusted, type: event.inputType, data: event.data }))
  holder.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'z') history.push(event.isTrusted) })
  try {
    await waitForStyles(document)
    equal(editor.save().blocks, input.blocks)
    editor.setReadOnly(true); equal(field().contentEditable, 'false')
    editor.setReadOnly(false); equal(field().contentEditable, 'true')
    equal(editor.save().blocks, input.blocks); equal(transactions, [])
    await assertCarouselCaptions(editor.save(), ['Alpha', 'Bravo'])
    const target = field(), tail = target.lastChild
    target.focus(); getSelection().setBaseAndExtent(tail, tail.length, tail, tail.length)
    await printable('&')
    equal(inputs, [{ trusted: true, type: 'insertText', data: '&' }])
    const edited = structuredClone(input.blocks); edited[0].data.slides[0].caption = 'Alpha&amp;'
    equal(editor.save().blocks, edited); equal(field().textContent, 'Alpha&')
    assert(field() === target && field().lastChild === tail)
    equal([getSelection().anchorNode === tail, getSelection().anchorOffset, getSelection().focusNode === tail, getSelection().focusOffset], [true, 6, true, 6])
    await assertCarouselCaptions(editor.save(), ['Alpha&', 'Bravo'])
    await dispatchKey('z', 'KeyZ', 90, 2)
    equal(editor.save().blocks, input.blocks); equal(field().textContent, 'Alpha')
    assert(!editor.canUndo && editor.canRedo)
    await assertCarouselCaptions(editor.save(), ['Alpha', 'Bravo'])
    await dispatchKey('z', 'KeyZ', 90, 10)
    equal(editor.save().blocks, edited); equal(field().textContent, 'Alpha&')
    assert(editor.canUndo && !editor.canRedo)
    await assertCarouselCaptions(editor.save(), ['Alpha&', 'Bravo'])
    equal(transactions, ['commit', 'undo', 'redo']); equal(history, [true, true])
    equal(input.blocks[0].data.slides[0].caption, 'Alpha')
  } finally { editor.destroy(); holder.remove() }
})
