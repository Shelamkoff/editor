import { Carousel } from '../../../plugins/carousel/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, equal, assert } from './harness.js'

export function register() {
  for (const validationMode of ['preserve', 'strict']) {
    test(`carousel ${validationMode} accepts a positive submillisecond delay without save/load drift`, () => {
      const editor = make([{ id: 'c', type: 'carousel', data: {
        slides: [{ id: 'image', type: 'image', src: '/image.png' }], options: { autoplayDelay: 0.5 },
      } }], { plugins: [new Paragraph(), new Carousel()], validationMode })
      const first = editor.save()
      equal(first.blocks[0].data.options.autoplayDelay, 1)
      editor.render(first)
      equal(editor.save().blocks, first.blocks)
      editor.setReadOnly(true)
      equal(editor.save().blocks, first.blocks)
    })
  }
  for (const validationMode of ['preserve', 'strict']) {
    test(`carousel ${validationMode} settings keep a submillisecond delay positive and undoable`, () => {
      const editor = make([{ id: 'carousel', type: 'carousel', data: {
        slides: [{ id: 'slide', type: 'image', src: '/image.png' }], options: { autoplayDelay: 3000 },
      } }], { plugins: [new Paragraph(), new Carousel()], validationMode })
      const before = editor.save().blocks
      const input = editor.rootElement.querySelector('.oe-carousel-block__field input[type="number"]')
      assert(input, 'the real delay settings field must exist')
      input.value = '0.5'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      const saved = editor.save()
      equal(saved.blocks[0].data.options.autoplayDelay, 1)
      assert(new Carousel().validate(saved.blocks[0].data), 'the saved delay must satisfy the carousel schema')
      editor.undo()
      equal(editor.save().blocks, before)
      editor.redo()
      equal(editor.save().blocks, saved.blocks)
      editor.render(saved)
      equal(editor.save().blocks, saved.blocks)
    })
  }
  for (const [value, expected] of [['1', 1], ['1.9', 1], ['1000.9', 1000], ['0', 3000], ['-1', 3000], ['', 3000]]) {
    test(`carousel delay settings ${JSON.stringify(value)} retain the positive-value contract`, () => {
      const editor = make([{ id: 'carousel', type: 'carousel', data: {
        slides: [{ id: 'slide', type: 'image', src: '/image.png' }], options: { autoplayDelay: 3000 },
      } }], { plugins: [new Paragraph(), new Carousel()], validationMode: 'strict' })
      const input = editor.rootElement.querySelector('.oe-carousel-block__field input[type="number"]')
      input.value = value
      input.dispatchEvent(new Event('change', { bubbles: true }))
      equal(editor.save().blocks[0].data.options.autoplayDelay, expected)
      equal(editor.canUndo, expected !== 3000, 'ignored values must not add history')
    })
  }
}
