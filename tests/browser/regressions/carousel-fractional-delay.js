import { Carousel } from '../../../plugins/carousel/index.js'
import { Paragraph } from '../../../plugins/paragraph/index.js'
import { test, make, equal } from './harness.js'

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
}
